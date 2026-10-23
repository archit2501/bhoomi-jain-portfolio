import { expect, test, type Locator } from '@playwright/test';
import { captionStart, dateText, NAME, pageTitle, posts, reels, tileName } from './fixtures';

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element is not visible');
  return b;
}

const pinned = posts.filter((p) => p.data.pinned);

test('posts tab: every post as a tile, the pinned posts first with a pin badge', async ({
  page,
}) => {
  await page.goto('/');
  const tiles = page.locator('#panel-posts .tile a');
  await expect(tiles).toHaveCount(posts.length);
  for (const [i, post] of pinned.entries()) {
    await expect(tiles.nth(i)).toHaveAttribute('href', `/p/${post.id}/`);
    await expect(tiles.nth(i)).toHaveAccessibleName(/^Pinned post\./);
    await expect(tiles.nth(i).locator('.badges svg').first()).toBeVisible();
  }
  await expect(tiles.nth(pinned.length)).not.toHaveAccessibleName(/Pinned/);
  await expect(tiles.first()).toHaveAccessibleName(tileName(posts[0]));
});

for (const [width, gap] of [
  [1280, 4],
  [390, 2],
] as const) {
  test(`${width}px: 3 columns of 3:4 tiles with ${gap}px gaps`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const tiles = page.locator('#panel-posts .tile a');
    const [a, b, c, d] = await Promise.all([0, 1, 2, 3].map((i) => box(tiles.nth(i))));
    expect(Math.round(a.y)).toBe(Math.round(b.y));
    expect(Math.round(b.y)).toBe(Math.round(c.y));
    expect(d.y).toBeGreaterThan(a.y);
    expect(Math.abs(a.height / a.width - 4 / 3)).toBeLessThan(0.02);
    expect(Math.round(b.x - (a.x + a.width))).toBe(gap);
  });
}

// A phone's tiles show no mono text, so the profile shouldn't wait on the mono face: an element
// that only sets the font (bars without their names) is enough to make the browser fetch it.
test('390px: the profile fetches only the display font', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fonts.push(new URL(r.url()).pathname);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.filter((f) => !f.includes('plus-jakarta-sans'))).toEqual([]);
});

test('tabs follow the ARIA tabs pattern and switch in place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const tablist = page.getByRole('tablist', { name: 'Profile sections' });
  const postsTab = tablist.getByRole('tab', { name: 'Posts' });
  const reelsTab = tablist.getByRole('tab', { name: 'Reels' });
  await expect(postsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Posts' })).toBeVisible();
  await expect(page.locator('#panel-reels')).toBeHidden();

  await postsTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(reelsTab).toBeFocused();
  await expect(reelsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/reels\/$/);
  await expect(page).toHaveTitle(pageTitle('Reels'));
  await expect(page.locator('#panel-reels')).toBeVisible();
  await expect(page.locator('#panel-posts')).toBeHidden();
  await expect(
    page.locator('nav.side-nav').getByRole('link', { name: 'Reels', exact: true }),
  ).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(postsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-posts')).toBeVisible();
});

test('/reels/ opens with the Reels tab selected', async ({ page }) => {
  await page.goto('/reels/');
  await expect(page.getByRole('tab', { name: 'Reels' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-reels .reel')).toHaveCount(reels.length);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAME);
});

test('on a phone, a tile opens its post page with the caption', async ({ page }) => {
  const post = posts[4];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#panel-posts .tile a').nth(4).click();
  await expect(page).toHaveURL(new RegExp(`/p/${post.id}/$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.data.title);
  await expect(page.locator('.post-view .caption').first()).toContainText(captionStart(post));
  if (post.data.org) {
    await expect(page.locator('.comment .meta').first()).toHaveText(post.data.org);
  }
  const date = dateText(post);
  if (date) await expect(page.locator('.post-view .date')).toHaveText(date);
});

test('keyboard focus on a tile draws the two-tone ring over the media', async ({ page }) => {
  await page.goto('/');
  const tile = page.locator('#panel-posts .tile a').first();
  await tile.focus();
  await expect(tile).toBeFocused();
  const ring = await tile.evaluate((el) => getComputedStyle(el, '::after').boxShadow);
  expect(ring).toContain('rgb(255, 255, 255)');
  expect(ring).toContain('rgb(12, 16, 20)');
});

test('the Tagged tab has its own address and a designed empty state', async ({ page }) => {
  await page.goto('/tagged/');
  await expect(page.getByRole('tab', { name: 'Tagged' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveTitle(pageTitle('Tagged'));
  const panel = page.getByRole('tabpanel', { name: 'Tagged' });
  await expect(panel.getByRole('heading', { name: 'No tagged posts yet' })).toBeVisible();
});
