import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { posts, row } from './fixtures';

const PAGES = [
  '/',
  '/reels/',
  `/stories/${row[0].id}/`,
  '/stories/intro/',
  `/p/${posts[0].id}/`,
  '/404.html',
];

for (const path of PAGES) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${path} has no serious accessibility issues (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
}

test('the contact sheet has no serious accessibility issues when open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('nav.bottom-tabs').getByRole('link', { name: 'Messages' }).click();
  const { violations } = await new AxeBuilder({ page }).include('#contact-sheet').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
