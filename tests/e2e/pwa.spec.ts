import { expect, test } from '@playwright/test';
import { posts, profile, reels, row } from './fixtures';

// An app-grade shell (task 5.1.3): installable, the browser bar black around stories and reels,
// an offline page, and empty states in Instagram's pattern.

test('the manifest makes her site installable, standalone, with maskable icons', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({
    name: profile.displayName,
    short_name: profile.displayName.split(' ')[0],
    display: 'standalone',
    start_url: '/',
  });
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.headers()['content-type']).toBe('image/png');
    const bytes = await res.body();
    const [w, h] = icon.sizes.split('x').map(Number);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([w, h]);
  }
});

test('the browser bar is black around reels, and while stories are open', async ({ page }) => {
  await page.goto(`/reels/${reels[0].id}/`);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');

  await page.goto('/');
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  await page.locator(`a.highlight[data-story="${row[0].id}"]`).click();
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#000000',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('meta[name="theme-color"][data-override]')).toHaveCount(0);
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'service workers, in Chromium');

  test('with no network, a page says so instead of failing', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Once it controls the page, the worker answers navigations.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await context.setOffline(true);
    await page.goto('/insights/');
    await expect(page.getByRole('heading', { level: 1, name: "You're offline" })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: "You're offline" })).toBeHidden();
  });
});

test.describe('empty states', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a post with no comments yet: glyph, title, a line, and one action', async ({ page }) => {
    // The comments list is empty until a comment is approved; this asks for one that has none.
    await page.route('**/api/comments/**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { ok: true, comments: [] } })
        : route.fallback(),
    );
    await page.goto(`/p/${posts[0].id}/`);
    await page.locator('.open-comments').first().click();
    const sheet = page.locator('.comments-sheet[open]');
    await expect(sheet.getByRole('heading', { name: 'No comments yet' })).toBeVisible();
    await expect(sheet.locator('.empty-state .glyph')).toBeVisible();
    await sheet.getByRole('button', { name: 'Add a comment' }).click();
    await expect(sheet.locator('textarea')).toBeFocused();
  });

  test('nothing saved yet, and offline: the same pattern', async ({ page }) => {
    for (const [path, title] of [
      ['/saved/', 'Save what you want to see again'],
      ['/offline/', "You're offline"],
    ]) {
      await page.goto(path);
      const empty = page.locator('.empty-state').first();
      await expect(empty.getByRole('heading', { name: title })).toBeVisible();
      await expect(empty.locator('.glyph')).toBeVisible();
      await expect(empty.getByRole('link')).toHaveCount(1);
    }
  });
});
