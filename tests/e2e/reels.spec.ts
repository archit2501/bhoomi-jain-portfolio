import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedOrder } from '../../src/lib/reels';
import { pageTitle, reels, videoReels } from './fixtures';

// Reels v2 (task 2.3.1): the profile's Reels tab, and the full-screen feed at /reels/<id>/.
// Content-driven: the reels, and which of them have a video and poster, come from src/content.
const [first, second] = reels;
const order = feedOrder(reels, first.id);
// The video tests start the feed on a video reel; `vorder` is the feed as it then reads.
const [firstVideo] = videoReels;
const vorder = firstVideo ? feedOrder(reels, firstVideo.id) : [];
const NO_VIDEO = 'needs reels with video';

const feed = (page: Page) => page.locator('.reels-feed');
const item = (page: Page, id: string) => page.locator(`.reel-item[data-reel="${id}"]`);
/** Scrolls the page to the nth reel in the feed, as a swipe would. */
const scrollToReel = (page: Page, n: number) =>
  page.evaluate((i) => document.querySelectorAll('.reel-item')[i].scrollIntoView(), n);
const plays = (page: Page) =>
  page.evaluate(() => (window as unknown as { __plays: number }).__plays);

// Playwright's open-source Chromium can't decode H.264, so play()/pause() are replaced with a
// stand-in that flips `paused` and fires the real events. That exercises the player's logic.
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

test.describe('the Reels tab', () => {
  test('shows every reel at 9:16, each linking to its own page', async ({ page }) => {
    await page.goto('/reels/');
    const tiles = page.locator('#panel-reels a[data-reel]');
    await expect(tiles).toHaveCount(reels.length);
    for (const [i, reel] of reels.entries()) {
      await expect(tiles.nth(i)).toHaveAttribute('href', `/reels/${reel.id}/`);
      await expect(tiles.nth(i)).toHaveAccessibleName(`Reel: ${reel.data.title}`);
    }
    const box = await page.locator('#panel-reels .reel').first().boundingBox();
    expect(Math.abs(box!.height / box!.width - 16 / 9)).toBeLessThan(0.02);
  });

  test('a tile opens the feed on that reel', async ({ page }) => {
    await page.goto('/reels/');
    await page.locator(`#panel-reels a[data-reel="${second.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/reels/${second.id}/$`));
    await expect(item(page, second.id)).toHaveAttribute('aria-posinset', '1');
  });
});

test.describe('the feed', () => {
  test('every reel has its own page, opening on that reel, with the rest one scroll away', async ({
    page,
  }) => {
    for (const reel of reels) {
      await page.goto(`/reels/${reel.id}/`);
      await expect(page).toHaveTitle(pageTitle(`${reel.data.title} · Reels`));
      await expect(feed(page)).toHaveAttribute('role', 'feed');
      const items = feed(page).locator('.reel-item');
      await expect(items).toHaveCount(reels.length);
      await expect(items.first()).toHaveAttribute('data-reel', reel.id);
      await expect(items.first()).toHaveAccessibleName(reel.data.title);
      await expect(items.first()).toHaveAttribute('aria-setsize', String(reels.length));
    }
  });

  test('each reel shows her caption, "Original audio" and the action rail', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    const reel = item(page, first.id);
    await expect(reel.locator('.reel-description')).toHaveText(
      first.data.description ?? first.data.title,
    );
    await expect(reel.locator('.reel-audio')).toContainText('Original audio');
    await expect(reel.getByRole('button', { name: 'Like' })).toBeVisible();
    await expect(reel.getByRole('button', { name: 'Copy link to this reel' })).toBeVisible();
  });

  test('scrolling to the next reel brings the URL and title with it', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    await scrollToReel(page, 1);
    await expect(page).toHaveURL(new RegExp(`/reels/${order[1].id}/$`));
    await expect(page).toHaveTitle(pageTitle(`${order[1].data.title} · Reels`));
  });

  test('a long caption opens with "more" and closes with "less"', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto(`/reels/${first.id}/`);
    const more = item(page, first.id).getByRole('button', { name: 'more' });
    test.skip(!(await more.isVisible()), 'this caption fits on one line');
    await more.click();
    const less = item(page, first.id).getByRole('button', { name: 'less' });
    await expect(less).toHaveAttribute('aria-expanded', 'true');
    await less.click();
    await expect(item(page, first.id).getByRole('button', { name: 'more' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('a like on the rail survives a reload', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    await page.evaluate(() => localStorage.clear());
    const like = () => item(page, first.id).getByRole('button', { name: 'Like' });
    await like().click();
    await expect(like()).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(like()).toHaveAttribute('aria-pressed', 'true');
  });

  test('has no serious accessibility issues', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    const { violations } = await new AxeBuilder({ page }).include('.reels-feed').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('a centred 9:16 reel with its rail beside it, and up and down buttons', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    const frame = (await item(page, first.id).locator('.reel-frame').boundingBox())!;
    expect(Math.abs(frame.width / frame.height - 9 / 16)).toBeLessThan(0.01);
    const rail = (await item(page, first.id).locator('.reel-rail').boundingBox())!;
    expect(rail.x).toBeGreaterThanOrEqual(frame.x + frame.width);

    const up = page.getByRole('button', { name: 'Previous reel' });
    const down = page.getByRole('button', { name: 'Next reel' });
    await expect(up).toBeDisabled();
    await down.click();
    await expect(page).toHaveURL(new RegExp(`/reels/${order[1].id}/$`));
    await expect(up).toBeEnabled();
    await up.click();
    await expect(page).toHaveURL(new RegExp(`/reels/${order[0].id}/$`));
  });

  test('Page Down and the arrow keys step one reel at a time', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    await page.keyboard.press('PageDown');
    await expect(page).toHaveURL(new RegExp(`/reels/${order[1].id}/$`));
    await page.keyboard.press('ArrowUp');
    await expect(page).toHaveURL(new RegExp(`/reels/${order[0].id}/$`));
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 760 } });

  test('fills the screen above the tab bar; the step buttons wait for focus', async ({
    page,
    browserName,
  }) => {
    await page.goto(`/reels/${first.id}/`);
    const frame = (await item(page, first.id).locator('.reel-frame').boundingBox())!;
    expect(Math.round(frame.width)).toBe(390);
    const down = page.getByRole('button', { name: 'Next reel' });
    expect((await down.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    for (let n = 0; n < 30 && !(await down.evaluate((b) => b === document.activeElement)); n++) {
      await page.keyboard.press(tab);
    }
    await expect(down).toBeFocused();
    expect((await down.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  });
});

test.describe('video reels', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(videoReels.length < 2 || vorder.length < 2, NO_VIDEO);
    await fakeMedia(page);
  });

  const video = (page: Page, id: string) => item(page, id).locator('video');
  const paused = (page: Page, id: string) =>
    video(page, id).evaluate((v: HTMLVideoElement) => v.paused);

  test('a reel plays muted once 60% is on screen; the next one waits', async ({ page }) => {
    await page.goto(`/reels/${firstVideo.id}/`);
    await expect(video(page, firstVideo.id)).toHaveAttribute('src', firstVideo.data.video!);
    await expect.poll(() => plays(page)).toBeGreaterThanOrEqual(1);
    for (const attr of ['muted', 'playsinline', 'loop']) {
      await expect(video(page, firstVideo.id)).toHaveAttribute(attr);
    }
    // Captions, when a reel has sound and so a captions file, are on from the start.
    const modes = await video(page, firstVideo.id).evaluate((v: HTMLVideoElement) =>
      [...v.textTracks].map((t) => t.mode),
    );
    expect(modes.every((m) => m === 'showing')).toBe(true);
    if (vorder[1].data.video) {
      await expect(video(page, vorder[1].id)).not.toHaveAttribute('src', /.+/);
    }
  });

  test('scrolling away pauses it; the next reel plays', async ({ page }) => {
    test.skip(!vorder[1].data.video, 'the next reel has no video');
    await page.goto(`/reels/${firstVideo.id}/`);
    await expect.poll(() => paused(page, firstVideo.id)).toBe(false);
    await scrollToReel(page, 1);
    await expect.poll(() => paused(page, firstVideo.id)).toBe(true);
    await expect.poll(() => paused(page, vorder[1].id)).toBe(false);
  });

  test('a hidden tab pauses the reel and showing it again resumes', async ({ page }) => {
    await page.goto(`/reels/${firstVideo.id}/`);
    await expect.poll(() => paused(page, firstVideo.id)).toBe(false);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(() => paused(page, firstVideo.id)).toBe(true);
    await setHidden(false);
    await expect.poll(() => paused(page, firstVideo.id)).toBe(false);
  });

  test('the button pauses, and a reel paused by hand stays paused on the way back', async ({
    page,
  }) => {
    await page.goto(`/reels/${firstVideo.id}/`);
    const reel = item(page, firstVideo.id);
    await reel.getByRole('button', { name: 'Pause' }).click();
    await expect(reel.getByRole('button', { name: 'Play' })).toBeVisible();
    await scrollToReel(page, 1);
    await expect(page).toHaveURL(new RegExp(`/reels/${vorder[1].id}/$`));
    await scrollToReel(page, 0);
    await expect(page).toHaveURL(new RegExp(`/reels/${firstVideo.id}/$`));
    await expect(reel.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('a tap on the video pauses it; a double-tap likes it instead', async ({ page }) => {
    await page.goto(`/reels/${firstVideo.id}/`);
    await page.evaluate(() => localStorage.clear());
    const reel = item(page, firstVideo.id);
    await expect.poll(() => paused(page, firstVideo.id)).toBe(false);
    const media = reel.locator('.reel-media');
    await media.dblclick({ position: { x: 120, y: 300 } });
    await expect(reel.getByRole('button', { name: 'Like' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.waitForTimeout(500);
    expect(await paused(page, firstVideo.id)).toBe(false);
    await media.click({ position: { x: 120, y: 300 } });
    await expect.poll(() => paused(page, firstVideo.id)).toBe(true);
  });

  test('with reduced motion nothing plays on its own', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/reels/${firstVideo.id}/`);
    await expect(video(page, firstVideo.id)).toHaveAttribute('src', /.+/);
    await page.waitForTimeout(300);
    expect(await plays(page)).toBe(0);
  });

  test('only the reel on screen and the next one load their poster', async ({ page }) => {
    const withPosters = vorder.slice(0, 3);
    test.skip(!withPosters.every((r) => r.data.poster), 'needs three reels in a row with posters');
    const byPoster = new Map(withPosters.map((r) => [r.data.poster!, r.id]));
    const loaded = new Set<string>();
    page.on('request', (request) => {
      const id = byPoster.get(new URL(request.url()).pathname);
      if (id) loaded.add(id);
    });
    await page.goto(`/reels/${firstVideo.id}/`);
    await expect.poll(() => [...loaded].sort()).toEqual([vorder[0].id, vorder[1].id].sort());
    await page.waitForTimeout(300);
    expect(loaded.has(vorder[2].id)).toBe(false);
    await scrollToReel(page, 1);
    await expect.poll(() => loaded.has(vorder[2].id)).toBe(true);
  });
});

test('her reel videos are fast-start MP4s under 4 MB, and posters exist', async ({ request }) => {
  test.skip(videoReels.length === 0, NO_VIDEO);
  for (const reel of videoReels) {
    const res = await request.get(reel.data.video!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('video/mp4');
    const body = await res.body();
    expect(body.length).toBeLessThan(4 * 1024 * 1024);
    // Fast start: the index (moov) comes before the media (mdat), so playback starts at once.
    expect(body.indexOf('moov')).toBeLessThan(body.indexOf('mdat'));
    if (reel.data.poster) expect((await request.get(reel.data.poster)).status()).toBe(200);
  }
});
