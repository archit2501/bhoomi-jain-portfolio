import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BASE, reels, videoReels } from './fixtures';

// Reels without a video yet show as text tiles; the player tests need at least two real videos.
const NO_VIDEO = 'needs two reels with video (task 2.3.2 adds her demo reels)';
const [firstVideo, secondVideo] = videoReels;
const lastVideo = videoReels[videoReels.length - 1];

// Playwright's open-source Chromium can't decode H.264, so play()/pause() are replaced with a
// stand-in that flips `paused` and fires the real events. That exercises the player's logic;
// the MP4s themselves are checked below (served, typed, sized) and with ffprobe at render time.
async function fakeMedia(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: number };
    w.__plays = 0;
    const setPaused = (el: HTMLMediaElement, paused: boolean) =>
      Object.defineProperty(el, 'paused', { configurable: true, get: () => paused });
    HTMLMediaElement.prototype.play = function () {
      w.__plays++;
      setPaused(this, false);
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      setPaused(this, true);
      this.dispatchEvent(new Event('pause'));
    };
  });
}

const player = (page: Page) => page.locator('#reel-player');
const video = (page: Page) => player(page).locator('video');

test('the Reels tab shows every reel at 9:16, videos as links with posters', async ({ page }) => {
  await page.goto('/reels/');
  await expect(page.locator('#panel-reels .reel')).toHaveCount(reels.length);
  const box = await page.locator('#panel-reels .reel').first().boundingBox();
  expect(Math.abs(box!.height / box!.width - 16 / 9)).toBeLessThan(0.02);
  const tiles = page.locator('#panel-reels a[data-reel]');
  await expect(tiles).toHaveCount(videoReels.length);
  if (firstVideo) {
    await expect(tiles.first()).toHaveAccessibleName(`Reel: ${firstVideo.data.title}`);
    if (firstVideo.data.poster) {
      await expect(tiles.first().locator('img')).toHaveAttribute('src', firstVideo.data.poster);
    }
  }
});

test('a reel opens and plays muted, inline and looping, and pauses on request', async ({
  page,
}) => {
  test.skip(videoReels.length < 2, NO_VIDEO);
  await fakeMedia(page);
  await page.goto('/reels/');
  await page.locator(`#panel-reels a[data-reel="${firstVideo.id}"]`).click();
  await expect(player(page)).toHaveAccessibleName(`Reel: ${firstVideo.data.title}`);
  await expect(video(page)).toHaveAttribute('src', firstVideo.data.video!);
  for (const attr of ['muted', 'loop', 'playsinline'])
    await expect(video(page)).toHaveAttribute(attr, '');
  expect(await page.evaluate(() => (window as unknown as { __plays: number }).__plays)).toBe(1);
  if (firstVideo.data.description) {
    const start = firstVideo.data.description.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(video(page)).toHaveAccessibleDescription(new RegExp(start));
  }
  const toggle = player(page).getByRole('button', { name: 'Pause' });
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(player(page).getByRole('button', { name: 'Play' })).toBeVisible();
});

test('arrow keys move between reels; Esc closes and unloads the video', async ({ page }) => {
  test.skip(videoReels.length < 2, NO_VIDEO);
  await fakeMedia(page);
  await page.goto('/reels/');
  await page.locator(`#panel-reels a[data-reel="${firstVideo.id}"]`).click();
  await page.keyboard.press('ArrowRight');
  await expect(player(page)).toHaveAccessibleName(`Reel: ${secondVideo.data.title}`);
  await expect(video(page)).toHaveAttribute('src', secondVideo.data.video!);
  await page.keyboard.press('ArrowLeft');
  await expect(player(page)).toHaveAccessibleName(`Reel: ${firstVideo.data.title}`);
  await page.keyboard.press('Escape');
  await expect(player(page)).toBeHidden();
  await expect(video(page)).not.toHaveAttribute('src', /.+/);
});

test('with reduced motion a reel opens paused', async ({ page }) => {
  test.skip(videoReels.length < 2, NO_VIDEO);
  await fakeMedia(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/reels/');
  await page.locator(`#panel-reels a[data-reel="${lastVideo.id}"]`).click();
  await expect(player(page).getByRole('button', { name: 'Play' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __plays: number }).__plays)).toBe(0);
});

test('the open player has no serious accessibility issues', async ({ page }) => {
  test.skip(videoReels.length < 2, NO_VIDEO);
  await fakeMedia(page);
  await page.goto('/reels/');
  await page.locator(`#panel-reels a[data-reel="${firstVideo.id}"]`).click();
  const { violations } = await new AxeBuilder({ page }).include('#reel-player').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('each reel video is a real MP4 under 2 MB, linked directly without JavaScript', async ({
  browser,
  request,
}) => {
  test.skip(videoReels.length < 2, NO_VIDEO);
  for (const reel of videoReels) {
    const res = await request.get(reel.data.video!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('video/mp4');
    expect((await res.body()).length).toBeLessThan(2 * 1024 * 1024);
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${BASE}/reels/`);
  await expect(page.locator(`a[data-reel="${secondVideo.id}"]`)).toHaveAttribute(
    'href',
    secondVideo.data.video!,
  );
  await context.close();
});

test.describe('phone player', () => {
  test.use({ viewport: { width: 390, height: 760 } });

  test('fills the screen with every control on screen and clickable', async ({ page }) => {
    test.skip(videoReels.length < 2, NO_VIDEO);
    await fakeMedia(page);
    await page.goto('/reels/');
    await page.locator(`#panel-reels a[data-reel="${secondVideo.id}"]`).click();
    const stage = await player(page).locator('.reel-stage').boundingBox();
    expect([Math.round(stage!.width), Math.round(stage!.height)]).toEqual([390, 760]);
    for (const name of ['Pause', 'Close']) {
      const button = player(page).getByRole('button', { name });
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await player(page).getByRole('button', { name: 'Close' }).click();
    await expect(player(page)).toBeHidden();
  });
});
