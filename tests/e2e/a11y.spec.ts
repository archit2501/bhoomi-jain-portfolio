import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { posts, row } from './fixtures';

const PAGES = [
  '/',
  '/reels/',
  `/stories/${row[0].id}/`,
  '/stories/intro/',
  `/p/${posts[0].id}/`,
  '/feed/',
  '/explore/',
  '/direct/',
  '/notifications/',
  '/insights/',
  '/tagged/',
  '/404.html',
];

for (const path of PAGES) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${path} has no serious accessibility issues (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      // Cards below the fold skip layout (content-visibility: auto) until a visitor nears them,
      // and their placeholder geometry misleads the spacing checks: audit the laid-out page.
      await page.addStyleTag({ content: '* { content-visibility: visible !important; }' });
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
}

test('the links sheet has no serious accessibility issues when open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .locator('header.profile')
    .getByRole('link', { name: /^and \d+ more$/ })
    .click();
  const { violations } = await new AxeBuilder({ page }).include('#contact-sheet').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
