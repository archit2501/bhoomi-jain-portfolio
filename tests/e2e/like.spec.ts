import { expect, test, type Page } from '@playwright/test';
import { LIKE_HAPTIC_MS } from '../../src/lib/likes';
import { posts } from './fixtures';

// The like moment (task 2.2.4), on a post page and in the pop-up. Content-driven: any post works.
const post = posts[0];

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

test.beforeEach(async ({ page }) => record(page));

test('tapping the heart springs the icon alone; tapping again unlikes', async ({ page }) => {
  await openPost(page);
  await expect(view(page).locator('.likes')).toBeHidden();
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText('Liked by you');

  const [spring] = await springs(page, 'heart-on');
  expect(spring.duration).toBe(420);
  expect(spring.keyframes.map((k) => k.scale)).toEqual([0, 1]);
  expect(await bursts(page)).toEqual([]);

  await likeButton(page).click();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page).locator('.likes')).toBeHidden();
  expect((await springs(page, 'heart-off')).map((a) => a.keyframes[0].scale)).toEqual([0.8]);
});

test('a double-tap on the media plays the heart burst with the icon spring', async ({ page }) => {
  await openPost(page);
  const media = view(page).locator('.media');
  const box = (await media.boundingBox())!;
  await media.dblclick({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText('Liked by you');

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

test('a like survives reloads, and unliking forgets it', async ({ page }) => {
  await openPost(page);
  await likeButton(page).click();
  await page.reload();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(view(page).locator('.likes')).toHaveText('Liked by you');
  await likeButton(page).click();
  await page.reload();
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(view(page).locator('.likes')).toBeHidden();
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
  await modal.getByRole('button', { name: 'Like' }).click();
  await expect(modal.getByText('Liked by you')).toBeVisible();
  await page.goto(`/p/${post.id}/`);
  await expect(likeButton(page)).toHaveAttribute('aria-pressed', 'true');
});
