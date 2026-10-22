import { expect, test } from '@playwright/test';
import { parseEvents, parseGraphql, type GithubSnapshot } from '../../src/lib/github';
import { eventsAnswer, graphqlAnswer } from '../../src/lib/github-fixtures';

// Her GitHub on Insights (task 4.2.1): GitHub's own numbers "as of" the last sync, or a plain
// "unavailable". The preview has no token and no snapshot, so the live API says unavailable.

const snapshot: GithubSnapshot = {
  version: 1,
  fetchedAt: '2026-10-22T14:07:00.000Z',
  ...parseGraphql(graphqlAnswer()),
  events: parseEvents(eventsAnswer),
};
const section = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'GitHub' });

test('with no snapshot, it says unavailable and shows no numbers', async ({ page }) => {
  const api = page.waitForResponse('**/api/github');
  await page.goto('/insights/');
  expect(await (await api).json()).toEqual({ ok: false, error: 'unavailable', lastAttempt: null });
  await expect(section(page)).toContainText('Her GitHub activity is unavailable right now.');
  await expect(section(page).locator('[data-github-figures]')).toBeHidden();
});

test('with a snapshot, GitHub’s own numbers and when they were true', async ({ page }) => {
  await page.route('**/api/github', (route) =>
    route.fulfill({ json: { ok: true, snapshot, lastSync: { ok: true } } }),
  );
  await page.goto('/insights/');
  const figures = section(page).locator('[data-github-figures] .value');
  await expect(figures).toHaveText(['7', '5', '2']);
  await expect(section(page)).toContainText('From GitHub, as of 22 Oct, 14:07 UTC');
  await expect(section(page).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/bhoomi',
  );
});

test('if the API fails, it says unavailable rather than guess', async ({ page }) => {
  await page.route('**/api/github', (route) => route.abort());
  await page.goto('/insights/');
  await expect(section(page)).toContainText('unavailable right now');
});
