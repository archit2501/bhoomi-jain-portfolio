import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedOrder } from '../../src/lib/reels';
import { pageTitle, reels, videoReels } from './fixtures';

// Reels v2 (task 2.3.1): the profile's Reels tab, and the full-screen feed at /reels/<id>/.
// Content-driven. Her demo videos arrive in task 2.3.2; until then the video tests serve the feed
// with stand-in <video> and poster markup injected (see `withStandInVideos`), so autoplay,
// captions, pausing and poster loading are exercised now, and against the real videos later.
const [first, second] = reels;
const order = feedOrder(reels, first.id);

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

/**
 * Serves the feed as if every reel had a video, a poster and captions, the way ReelsFeed
 * renders one: the first poster with src, the rest parked in data-src. Requests to the stand-in
 * files are tagged with the reel id so tests can see what loaded.
 */
async function withStandInVideos(page: Page) {
  await page.route(/\/reels\/[a-z0-9-]+\/$/, async (route) => {
    const response = await route.fetch();
    let i = 0;
    const body = (await response.text()).replace(
      /(<article[^>]*data-reel="([a-z0-9-]+)"[\s\S]*?<div class="reel-media"[^>]*>)/g,
      (match, _open, id: string) => {
        const poster = `/og/default.png?poster=${id}`;
        const posterAttr = i++ === 0 ? `src="${poster}"` : `data-src="${poster}"`;
        return `${match}<img class="reel-poster" ${posterAttr} alt="">
          <video class="reel-video" data-src="/og/default.png?video=${id}" playsinline muted loop
            preload="none"><track kind="captions" src="/robots.txt" srclang="en" label="English"
            default></video>
          <button class="reel-toggle" type="button" aria-label="Play">Play</button>`;
      },
    );
    await route.fulfill({ response, body });
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
    await fakeMedia(page);
    await withStandInVideos(page);
  });

  test('a reel plays muted once 60% is on screen, with captions on', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    const video = item(page, first.id).locator('video');
    await expect(video).toHaveAttribute('src', `/og/default.png?video=${first.id}`);
    await expect.poll(() => plays(page)).toBeGreaterThanOrEqual(1);
    for (const attr of ['muted', 'playsinline', 'loop']) await expect(video).toHaveAttribute(attr);
    expect(await video.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.mode)).toBe('showing');
    // The next reel's video waits until it is on screen.
    await expect(item(page, order[1].id).locator('video')).not.toHaveAttribute('src', /.+/);
  });

  test('scrolling away pauses it; the next reel plays', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    const firstVideo = item(page, first.id).locator('video');
    await expect.poll(() => firstVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await scrollToReel(page, 1);
    await expect.poll(() => firstVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    const nextVideo = item(page, order[1].id).locator('video');
    await expect.poll(() => nextVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  });

  test('a hidden tab pauses the reel and showing it again resumes', async ({ page }) => {
    await page.goto(`/reels/${first.id}/`);
    const video = item(page, first.id).locator('video');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await setHidden(false);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  });

  test('the button pauses, and a reel paused by hand stays paused on the way back', async ({
    page,
  }) => {
    await page.goto(`/reels/${first.id}/`);
    const reel = item(page, first.id);
    await expect(reel.getByRole('button', { name: 'Pause' })).toBeVisible();
    await reel.getByRole('button', { name: 'Pause' }).click();
    await expect(reel.getByRole('button', { name: 'Play' })).toBeVisible();
    await scrollToReel(page, 1);
    await expect(page).toHaveURL(new RegExp(`/reels/${order[1].id}/$`));
    await scrollToReel(page, 0);
    await expect(page).toHaveURL(new RegExp(`/reels/${first.id}/$`));
    await expect(reel.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('with reduced motion nothing plays on its own', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/reels/${first.id}/`);
    await expect(item(page, first.id).locator('video')).toHaveAttribute('src', /.+/);
    await page.waitForTimeout(300);
    expect(await plays(page)).toBe(0);
  });

  test('only the reel on screen and the next one load their poster', async ({ page }) => {
    test.skip(reels.length < 3, 'needs three reels');
    const loaded = new Set<string>();
    page.on('request', (request) => {
      const id = /[?&]poster=([a-z0-9-]+)/.exec(request.url())?.[1];
      if (id) loaded.add(id);
    });
    await page.goto(`/reels/${first.id}/`);
    await expect.poll(() => [...loaded].sort()).toEqual([order[0].id, order[1].id].sort());
    await page.waitForTimeout(300);
    expect(loaded.has(order[2].id)).toBe(false);
    await scrollToReel(page, 1);
    await expect.poll(() => loaded.has(order[2].id)).toBe(true);
  });
});

test('her real reel videos are MP4s under 4 MB', async ({ request }) => {
  test.skip(videoReels.length === 0, 'her demo reels arrive in task 2.3.2');
  for (const reel of videoReels) {
    const res = await request.get(reel.data.video!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('video/mp4');
    expect((await res.body()).length).toBeLessThan(4 * 1024 * 1024);
  }
});
