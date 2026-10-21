import { expect, test, type Page } from '@playwright/test';
import { LIKE_HAPTIC_MS } from '../../src/lib/likes';
import { BASE, posts } from './fixtures';
import { ownIp, stubTurnstile } from './live';

// The like moment (task 2.2.4) and real likes (task 3.1.2), on a post page and in the pop-up.
// Likes now reach the local database, which every test and device shares, so the UI tests only
// assert what depends on this visitor's own like ("Liked by you…"); the count test has a post
// nobody else likes.
const post = posts[0];
const counted = posts[5 % posts.length];
const youLiked = /^Liked by you/;

interface Recorded {
  target: string;
  keyframes: Record<string, string | number>[];
  duration: number;
}

/** Records every Web Animations call and every vibration, before the page's scripts run. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const animations: unknown[] = [];
    const vibrations: unknown[] = [];
    Object.assign(window, { __animations: animations, __vibrations: vibrations });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      animations.push({
        target: this.getAttribute('class') ?? '',
        keyframes,
        duration: typeof options === 'number' ? options : options?.duration,
      });
      return animate.call(this, keyframes, options);
    };
    Object.defineProperty(Navigator.prototype, 'vibrate', {
      configurable: true,
      value: (pattern: unknown) => vibrations.push(pattern) > 0,
    });
  });
}

const animations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __animations: Recorded[] }).__animations);
const vibrations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations);
const springs = async (page: Page, icon: 'heart-on' | 'heart-off') =>
  (await animations(page)).filter((a) => a.target.split(' ').includes(icon));
const bursts = async (page: Page) =>
  (await animations(page)).filter((a) => a.target.includes('burst'));

const view = (page: Page) => page.locator('.post-view').first();
const likeButton = (page: Page) => view(page).getByRole('button', { name: 'Like' });

async function openPost(page: Page) {
  await page.goto(`/p/${post.id}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
}

test.beforeEach(async ({ page }, testInfo) => {
  await record(page);
  await stubTurnstile(page);
  await ownIp(page, testInfo);
});

/** Waits for the like to reach the database (the optimistic UI shows it before it lands). */
const saved = (page: Page, method: 'POST' | 'DELETE') =>
  page.waitForResponse(
    (r) => r.url().includes('/api/likes/') && r.request().method() === method && r.ok(),
  );

test('tapping the heart springs the icon alone; tapping again unlikes', async ({ page }) => {
  await openPost(page);
  await expect(view(page).locator('.likes')).not.toContainText('you');
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText(youLiked);

  const [spring] = await springs(page, 'heart-on');
  expect(spring.duration).toBe(420);
  expect(spring.keyframes.map((k) => k.scale)).toEqual([0, 1]);
  expect(await bursts(page)).toEqual([]);

  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page).locator('.likes')).not.toContainText('you');
  expect((await springs(page, 'heart-off')).map((a) => a.keyframes[0].scale)).toEqual([0.8]);
});

test('a double-tap on the media plays the heart burst with the icon spring', async ({ page }) => {
  await openPost(page);
  const media = view(page).locator('.media');
  const box = (await media.boundingBox())!;
  await media.dblclick({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText(youLiked);

  const [burst] = await bursts(page);
  expect(burst.duration).toBe(900);
  expect(burst.keyframes[0].opacity).toBe(0);
  expect(String(burst.keyframes[1].transform)).toMatch(/rotate\(-?\d+deg\) scale\(1\)/);
  expect(await springs(page, 'heart-on')).toHaveLength(1);

  // A second double-tap never unlikes; it plays another heart.
  await media.dblclick({ position: { x: box.width * 0.6, y: box.height * 0.5 } });
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await bursts(page)).toHaveLength(2);
  // Each heart cleans up after itself.
  await expect(view(page).locator('.burst.flying')).toHaveCount(0, { timeout: 3000 });
});

test('a like is saved: it survives a reload, even with this browser’s storage cleared', async ({
  page,
}) => {
  await openPost(page);
  const like = saved(page, 'POST');
  await likeButton(page).click();
  await like;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Only the database (through the visitor cookie) can know it now.
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText(youLiked);
  const unlike = saved(page, 'DELETE');
  await likeButton(page).click();
  await unlike;
  await page.reload();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page).locator('.likes')).not.toContainText('you');
});

test('keyboard users like and unlike with the button', async ({ page }) => {
  await openPost(page);
  await likeButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
});

test('a like gives a short vibration where the device has one; unliking does not', async ({
  page,
}) => {
  await openPost(page);
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await vibrations(page)).toEqual([LIKE_HAPTIC_MS]);
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await vibrations(page)).toEqual([LIKE_HAPTIC_MS]);
});

test('with reduced motion, a like is instant: no spring, no burst', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPost(page);
  await view(page).locator('.media').dblclick();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await bursts(page)).toEqual([]);
  expect(await springs(page, 'heart-on')).toEqual([]);
});

test('a like in the pop-up shows on the post page too', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the pop-up is desktop-only');
  await openPost(page);
  await page.goto('/');
  await page.locator(`#panel-posts a[data-post="${post.id}"]`).click();
  const modal = page.locator('#post-modal .post-view');
  const like = saved(page, 'POST');
  await modal.getByRole('button', { name: 'Like' }).click();
  await expect(modal.locator('.likes')).toHaveText(youLiked);
  await like;
  await page.goto(`/p/${post.id}/`);
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
});

test('a server that refuses the like puts it back and says so', async ({ page }) => {
  await openPost(page);
  await page.route('**/api/likes/**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 429, json: { ok: false, error: 'rate_limited' } })
      : route.fallback(),
  );
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page).locator('.action-row .status')).toHaveText(
    "Couldn't save your like. Try again.",
  );
});

test('a tap before the count has loaded, then a refused save, still puts it back', async ({
  page,
}) => {
  // Hold the first read until after the tap, so the save fails with nothing heard from the server.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/likes/**', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 429, json: { ok: false, error: 'rate_limited' } });
    }
    await held;
    return route.fallback();
  });
  await page.goto(`/p/${post.id}/`);
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page).locator('.action-row .status')).toHaveText(
    "Couldn't save your like. Try again.",
  );
  release();
  await page.waitForTimeout(300);
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
});

test('with likes switched off, a like still shows, in this browser only', async ({ page }) => {
  await page.route('**/api/likes/**', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'disabled' } }),
  );
  await openPost(page);
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText('Liked by you');
  await page.reload();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
});

/**
 * A likes line with a number holds it twice: once for screen readers (visually hidden) and once
 * as the rolling odometer (hidden from them). Both must read the same.
 */
async function expectLine(page: Page, text: string) {
  const line = view(page).locator('.likes');
  if (!/\d/.test(text)) return expect(line).toHaveText(text);
  await expect(line.locator('.visually-hidden')).toHaveText(text);
  await expect(line.locator('[aria-hidden="true"]')).toHaveText(text);
}

test.describe('counts', () => {
  // Exact counts need a post no other test touches, so this runs in one project only.
  test.skip(
    ({ browserName, isMobile, viewport }) =>
      browserName !== 'chromium' || isMobile || viewport?.width !== 1280,
    'the laptop project only',
  );

  test("'Liked by visitors' until 10 likes, then the real number, which rolls", async ({
    page,
    playwright,
  }) => {
    // Other visitors like the post, each a stranger (no cookie) from their own address.
    const likeAs = async (i: number) => {
      const stranger = await playwright.request.newContext({ baseURL: BASE });
      const res = await stranger.post(`/api/likes/${counted.id}`, {
        headers: { Origin: BASE, 'cf-connecting-ip': `192.0.2.${i}` },
        data: { turnstile: 'e2e-token' },
      });
      await stranger.dispose();
      return res;
    };
    for (let i = 1; i <= 9; i++) expect((await likeAs(i)).ok()).toBe(true);

    await page.goto(`/p/${counted.id}/`);
    await expectLine(page, 'Liked by visitors');

    // A tenth like: from here the real number shows.
    expect((await likeAs(10)).ok()).toBe(true);
    await page.reload();
    await expectLine(page, '10 likes');

    const like = saved(page, 'POST');
    await likeButton(page).click();
    await like;
    await expectLine(page, 'Liked by you and 10 others');

    // Someone else likes it meanwhile. When she unlikes, the server's count wins, and the
    // number rolls from what she saw (10) to what the database says (11).
    expect((await likeAs(11)).ok()).toBe(true);
    const unlike = saved(page, 'DELETE');
    await likeButton(page).click();
    await unlike;
    await expectLine(page, '11 likes');
    const rolls = (await animations(page)).filter((a) =>
      String(a.keyframes[0]?.transform ?? '').startsWith('translateY('),
    );
    expect(rolls.length).toBeGreaterThan(0);
  });
});
