import { expect, test, type Page } from '@playwright/test';
import { FIRST_NAME, posts, reels, row } from './fixtures';

// Explore (task 4.1.2): one mosaic of everything she has published, reels standing tall beside
// blocks of four, alternating sides; and the 404 page, with the same grid below.

const grid = (page: Page) => page.locator('.explore-grid').first();
const box = async (page: Page, selector: string) =>
  (await grid(page).locator(selector).boundingBox())!;

test('Explore shows every post, reel and story, each linking to its page', async ({ page }) => {
  await page.goto('/explore/');
  const links = grid(page).getByRole('link');
  await expect(links).toHaveCount(posts.length + reels.length + row.length);
  for (const post of posts) {
    await expect(grid(page).locator(`a[href="/p/${post.id}/"]`)).toHaveCount(1);
  }
  for (const reel of reels) {
    await expect(
      grid(page).getByRole('link', { name: `Reel: ${reel.data.title}` }),
    ).toHaveAttribute('href', `/reels/${reel.id}/`);
  }
  for (const story of row) {
    await expect(
      grid(page).getByRole('link', { name: new RegExp(`^Highlight: ${story.data.label}, `) }),
    ).toHaveAttribute('href', `/stories/${story.id}/`);
  }
});

test('reels stand two rows tall, on the right, then the left', async ({ page }) => {
  test.skip(Math.floor((posts.length + row.length) / 4) < 2 || reels.length < 2, 'too few tiles');
  await page.goto('/explore/');
  const tall = grid(page).locator('.reel.tall');
  await expect(tall.first()).toBeVisible();
  const first = (await tall.nth(0).boundingBox())!;
  const second = (await tall.nth(1).boundingBox())!;
  const square = await box(page, '.tile:not(.tall) >> nth=0');
  const whole = (await grid(page).boundingBox())!;
  // Right column, then left; each as tall as two tiles and the gap between them.
  expect(Math.round(first.x + first.width)).toBe(Math.round(whole.x + whole.width));
  expect(Math.round(second.x)).toBe(Math.round(whole.x));
  expect(first.height).toBeGreaterThan(square.height * 2);
  expect(first.height).toBeLessThan(square.height * 2 + 6);
  // Four tiles beside each: the next block starts below the first tall reel.
  expect(Math.round(second.y)).toBeGreaterThanOrEqual(Math.round(first.y + first.height));
});

test('a story tile opens that highlight', async ({ page }) => {
  await page.goto('/explore/');
  await grid(page).locator(`a[href="/stories/${row[0].id}/"]`).click();
  await expect(page).toHaveURL(new RegExp(`/stories/${row[0].id}/`));
});

test("a missing page says it isn't available, with a way back and Explore below", async ({
  page,
}) => {
  const res = await page.goto('/no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "Sorry, this page isn't available.",
  );
  await expect(page.getByText('The link you followed may be broken')).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Go back to ${FIRST_NAME}'s profile.` }),
  ).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: 'More to explore' })).toBeVisible();
  await expect(grid(page).getByRole('link')).toHaveCount(posts.length + reels.length + row.length);
});
