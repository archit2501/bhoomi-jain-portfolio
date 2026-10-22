import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { resume } from './fixtures';

// Search (task 4.1.1): typo-tolerant results, tabs, recent searches and the "no results" state,
// in the desktop drawer. The phone's full-screen version is in shell.spec.ts.
test.use({ viewport: { width: 1280, height: 860 } });

const panel = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const box = (page: Page) => page.getByRole('searchbox', { name: /Search projects/ });
const titles = (page: Page) => panel(page).locator('[data-search-results] .result-title');

async function openSearch(page: Page, path = '/') {
  await page.goto(path);
  await page.locator('nav.side-nav').getByRole('link', { name: 'Search' }).click();
  await expect(box(page)).toBeFocused();
}

test("typos are forgiven: 'reakt' finds React, 'mongdb' finds MongoDB", async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type('reakt');
  await expect(titles(page).first()).toHaveText('ReactJS');
  await box(page).fill('mongdb');
  await expect(titles(page).first()).toHaveText('MongoDB');
  await expect(panel(page).getByRole('status')).toHaveText(/^\d+ results?$/);
});

test('tabs narrow the results, by click or by arrow keys', async ({ page }) => {
  await openSearch(page);
  const tabs = panel(page).getByRole('tablist', { name: 'What to show' });
  await expect(tabs).toBeHidden();
  await page.keyboard.type('react');
  await expect(tabs.getByRole('tab')).toHaveText(['Top', 'Projects', 'Stack', 'Tags', 'Reels']);
  await expect(tabs.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'Stack' }).click();
  await expect(panel(page).getByRole('tabpanel', { name: 'Stack' })).toBeVisible();
  const kinds = panel(page).locator('[data-search-results] .result-kind');
  await expect(kinds.first()).toHaveText(/^Skill · /);
  expect((await kinds.allTextContents()).every((k) => k.startsWith('Skill · '))).toBe(true);

  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Tags' })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Tags' })).toHaveAttribute('aria-selected', 'true');
  expect((await titles(page).allTextContents()).every((t) => t.startsWith('#'))).toBe(true);

  await tabs.getByRole('tab', { name: 'Projects' }).click();
  const projects = Object.values(resume.projects).map((p) => p.name);
  for (const title of await titles(page).allTextContents()) expect(projects).toContain(title);

  // Clearing the box goes back to Top.
  await panel(page).getByRole('button', { name: 'Clear search' }).click();
  await expect(tabs).toBeHidden();
  await expect(box(page)).toBeFocused();
});

test('a tag opens a search for it on Explore', async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type('#reactjs');
  await panel(page).getByRole('tab', { name: 'Tags' }).click();
  await panel(page)
    .getByRole('link', { name: /^#reactjs Tag · \d+ posts?$/ })
    .click();
  await expect(page).toHaveURL(/\/explore\/\?q=ReactJS$/);
  await expect(box(page)).toHaveValue('ReactJS');
  await expect(titles(page).first()).toHaveText('ReactJS');
});

test('recent picks are kept in this browser, and can be removed or cleared', async ({ page }) => {
  await openSearch(page);
  const recent = panel(page).getByRole('region', { name: 'Recent' });
  await expect(recent).toBeHidden();
  await expect(panel(page).locator('[data-search-hint]')).toBeVisible();

  await page.keyboard.type('fastapi');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/stories\/stack\/$/);

  await openSearch(page, '/explore/');
  await page.keyboard.type('smartblog');
  await titles(page).first().click();
  await expect(page).toHaveURL(/\/p\/smartblog-ai\/$/);

  await openSearch(page);
  await expect(recent).toBeVisible();
  await expect(recent.locator('.result-title')).toHaveText(['SmartBlog AI', 'FastAPI']);
  await expect(panel(page).locator('[data-search-hint]')).toBeHidden();

  await recent.getByRole('button', { name: 'Remove SmartBlog AI from recent' }).click();
  await expect(recent.locator('.result-title')).toHaveText(['FastAPI']);
  await recent.getByRole('button', { name: 'Clear all' }).click();
  await expect(recent).toBeHidden();
  await page.reload();
  await page.locator('nav.side-nav').getByRole('link', { name: 'Search' }).click();
  await expect(recent).toBeHidden();
});

test('no results says so, and what to try', async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type('zqxwv');
  const empty = panel(page).locator('[data-search-empty]');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('heading', { level: 3 })).toHaveText('No results for "zqxwv"');
  await expect(empty).toContainText('Typos are fine.');
  await expect(empty.getByRole('link', { name: 'Browse Explore' })).toHaveAttribute(
    'href',
    '/explore/',
  );
  await expect(panel(page).getByRole('status')).toHaveText('No results for "zqxwv"');
});

test('the panel with results has no serious accessibility issues', async ({ page }) => {
  await openSearch(page);
  await page.keyboard.type('react');
  await expect(titles(page).first()).toBeVisible();
  // Measured once the drawer has finished sliding in, not mid-fade.
  await expect(panel(page)).toHaveCSS('opacity', '1');
  const { violations } = await new AxeBuilder({ page }).include('#panel-search').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
