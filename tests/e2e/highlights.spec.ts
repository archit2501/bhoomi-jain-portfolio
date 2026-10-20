import { expect, test } from '@playwright/test';
import { BASE, highlightName, row } from './fixtures';

test('every highlight in order, each linking to its stories', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('region', { name: 'Highlights' }).getByRole('link');
  await expect(links).toHaveCount(row.length);
  await expect(links.locator('.label')).toHaveText(row.map((h) => h.data.label));
  await expect(links.first()).toHaveAccessibleName(highlightName(row[0]));
  await expect(links.first()).toHaveAttribute('href', `/stories/${row[0].id}/`);
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('77px circles with a neutral 1px ring', async ({ page }) => {
    await page.goto('/');
    const first = page.locator('.highlight').first();
    await expect(first.locator('.cover')).toHaveCSS('width', '77px');
    // About 1px: an emulated iPad forced to 1280px scales the page and reports 0.8px.
    const ring = await first
      .locator('.ring')
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(ring).toBeGreaterThanOrEqual(0.75);
    expect(ring).toBeLessThanOrEqual(1.25);
    await expect(first.locator('.ring')).not.toHaveCSS('background-image', /gradient/);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('64px circles in a row that scrolls sideways with snapping', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.highlight .cover').first()).toHaveCSS('width', '64px');
    const list = page.locator('.highlights ul');
    await expect(list).toHaveCSS('scroll-snap-type', /^x( proximity)?$/);
    const { scrollWidth, clientWidth } = await list.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });
});

test('keyboard focus is visible on a highlight', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.highlight').first();
  await first.focus();
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS('outline-style', 'solid');
});

test('without JavaScript, a highlight opens its stories page', async ({ browser }) => {
  const highlight = row.find((h) => h.data.frames.every((f) => f.type === 'text')) ?? row[0];
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.getByRole('link', { name: highlightName(highlight) }).click();
  await expect(page).toHaveURL(new RegExp(`/stories/${highlight.id}/$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(highlight.data.label);
  await expect(page.locator('.frame')).toHaveCount(highlight.data.frames.length);
  const images = highlight.data.frames.filter((f) => f.type === 'image').length;
  await expect(page.locator('.frame img')).toHaveCount(images);
  await context.close();
});
