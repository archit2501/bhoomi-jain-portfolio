import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { BASE, captionStart, HOME_TITLE, NAME, pageTitle, posts } from './fixtures';

const [first, second] = posts;
const last = posts[posts.length - 1];
const carousel = posts.find((p) => p.data.media.length > 1) ?? first;
const slides = carousel.data.media.length;
/** A post from the middle of the grid, so neither arrow is at an end. */
const middle = posts[Math.min(2, posts.length - 1)];
const tile = (id: string) => `#panel-posts a[data-post="${id}"]`;

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element is not visible');
  return b;
}

test.describe('desktop pop-up', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a tile opens the post beside its details, at the post URL', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(first.id)).click();
    const dialog = page.getByRole('dialog', { name: first.data.title });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/p/${first.id}/$`));
    await expect(page).toHaveTitle(pageTitle(first.data.title));
    const media = await box(dialog.locator('.media'));
    const head = await box(dialog.locator('.head'));
    expect(head.x).toBeGreaterThanOrEqual(media.x + media.width - 1);
    expect(head.width).toBeGreaterThanOrEqual(335);
    await expect(dialog.locator('.caption').first()).toContainText(captionStart(first));
  });

  test('arrow keys move between posts without adding history', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(first.id)).click();
    const dialog = page.locator('#post-modal');
    await expect(dialog.locator('.post-prev')).toBeHidden();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`/p/${second.id}/$`));
    await expect(dialog).toHaveAccessibleName(second.data.title);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`/p/${first.id}/$`));
    await dialog.locator('.post-next').click();
    await expect(page).toHaveURL(new RegExp(`/p/${second.id}/$`));

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(HOME_TITLE);
    await expect(page.locator(tile(second.id))).toBeFocused();
  });

  test('the last post has no next button', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(last.id)).click();
    await expect(page.locator('#post-modal .post-next')).toBeHidden();
    await expect(page.locator('#post-modal .post-prev')).toBeVisible();
  });

  test('browser Back and the close button both close it', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(middle.id)).click();
    await expect(page.locator('#post-modal')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#post-modal')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);

    await page.goForward();
    await expect(page.locator('#post-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#post-modal')).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('carousel: next slide, dots and an announcement', async ({ page }) => {
    test.skip(slides < 2, 'no post has more than one slide');
    await page.goto('/');
    await page.locator(tile(carousel.id)).click();
    const view = page.locator('#post-modal .post-view');
    await expect(view.locator('.slide-nav.prev')).toBeHidden();
    await view.getByRole('button', { name: 'Next slide' }).click();
    await expect(view.locator('.slide-status')).toHaveText(`Slide 2 of ${slides}`);
    await expect(view.locator('.dots span').nth(1)).toHaveClass(/on/);
    for (let i = 2; i < slides; i++) await view.getByRole('button', { name: 'Next slide' }).click();
    await expect(view.locator('.slide-status')).toHaveText(`Slide ${slides} of ${slides}`);
    await expect(view.getByRole('button', { name: 'Next slide' })).toBeHidden();
    await expect(view.getByRole('button', { name: 'Previous slide' })).toBeVisible();
  });

  test('double-click likes the post with the heart burst', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(middle.id)).click();
    const view = page.locator('#post-modal .post-view');
    await view.locator('.media').dblclick();
    await expect(view.getByRole('button', { name: 'Like' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(view.locator('.burst')).toHaveClass(/play/);
    await view.getByRole('button', { name: 'Like' }).click();
    await expect(view.getByRole('button', { name: 'Like' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('with reduced motion, a double-click likes without the animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator(tile(middle.id)).click();
    const view = page.locator('#post-modal .post-view');
    await view.locator('.media').dblclick();
    await expect(view.getByRole('button', { name: 'Like' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(view.locator('.burst')).not.toHaveClass(/play/);
  });

  test('copy link puts the post URL on the clipboard', async ({ page, context, browserName }) => {
    // WebKit can't grant clipboard-read to tests, so there only the confirmation is checked.
    const canRead = browserName === 'chromium';
    if (canRead) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.locator(tile(middle.id)).click();
    await page.getByRole('button', { name: 'Copy link to this post' }).click();
    await expect(page.locator('#post-modal .actions .status')).toHaveText('Link copied');
    if (canRead) {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `${BASE}/p/${middle.id}/`,
      );
    }
  });

  test('the open pop-up has no serious accessibility issues', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(first.id)).click();
    await expect(page.locator('#post-modal')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('#post-modal').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a tile opens the full post page, not a pop-up', async ({ page }) => {
    await page.goto('/');
    await page.locator(tile(middle.id)).click();
    await expect(page).toHaveURL(new RegExp(`/p/${middle.id}/$`));
    await expect(page.locator('#post-modal')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(middle.data.title);
    const head = await box(page.locator('.post-view .head'));
    const media = await box(page.locator('.post-view .media'));
    expect(media.y).toBeGreaterThan(head.y);
  });
});

test('each post page has its own share card', async ({ page, request }) => {
  await page.goto(`/p/${middle.id}/`);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    `${middle.data.title} · ${NAME}`,
  );
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image).toMatch(new RegExp(`/og/p/${middle.id}\\.png$`));
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );

  const png = await request.get(`/og/p/${middle.id}.png`);
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toBe('image/png');
  const bytes = await png.body();
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
});
