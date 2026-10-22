import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { GithubSnapshot } from '../../src/lib/github';
import { figures, posts } from './fixtures';

// Insights (task 4.2.2): GitHub's numbers with a heatmap, this site's Lighthouse scores and its
// real totals, and her résumé figures, each with where it's from and when. The preview has no
// GitHub snapshot and no Lighthouse summary, so those are given here; the totals are real.

const days = Array.from({ length: 371 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 9, 17 + i));
  return { date: d.toISOString().slice(0, 10), count: i % 7 === 3 ? 0 : (i * 7) % 13 };
});
const snapshot: GithubSnapshot = {
  version: 1,
  fetchedAt: '2026-10-22T14:07:00.000Z',
  login: 'bhoomi',
  name: 'Bhoomi Jain',
  url: 'https://github.com/bhoomi',
  days,
  contributionsLastYear: days.reduce((n, d) => n + d.count, 0),
  commitsThisYear: 123,
  publicRepos: 9,
  repos: [
    {
      name: 'smartblog-ai',
      url: 'https://github.com/bhoomi/smartblog-ai',
      description: 'A blog',
      stars: 3,
      language: 'JavaScript',
      pushedAt: '2026-10-20T10:00:00Z',
    },
  ],
  events: [],
};
const lighthouse = {
  version: 1,
  measuredAt: '2026-10-22T13:00:00Z',
  lighthouseVersion: '12.6.1',
  source: 'https://github.com/archit2501/bhoomi-jain-portfolio/actions/runs/1',
  commit: 'abc',
  pages: [
    { path: '/', scores: { performance: 99, accessibility: 100, 'best-practices': 96, seo: 100 } },
    {
      path: '/reels/',
      scores: { performance: 72, accessibility: 100, 'best-practices': 96, seo: 45 },
    },
  ],
};

async function withData(page: Page) {
  await page.route('**/api/github', (route) =>
    route.fulfill({ json: { ok: true, snapshot, lastSync: { ok: true } } }),
  );
  await page.route('**/lighthouse.json', (route) => route.fulfill({ json: lighthouse }));
  await page.goto('/insights/');
}
const region = (page: Page, name: string) => page.getByRole('region', { name });

test('GitHub: the numbers, a year of contributions, recent repositories, and when', async ({
  page,
}) => {
  await withData(page);
  const github = region(page, 'GitHub');
  await expect(github.locator('[data-github-figures] .value')).toHaveText([
    snapshot.contributionsLastYear.toLocaleString('en'),
    '123',
    '9',
  ]);
  const heat = github.getByRole('img');
  await expect(heat).toHaveAttribute(
    'aria-label',
    new RegExp(
      `^${snapshot.contributionsLastYear.toLocaleString('en')} contributions in the past year, on \\d+ days\\. Busiest day: `,
    ),
  );
  await expect(heat.locator('.cell:not(.empty)')).toHaveCount(371);
  await expect(heat.locator('.cell[data-level="4"]').first()).toBeAttached();
  // Screen readers get the year as a table by month.
  await expect(
    github.getByRole('table', { name: 'Contributions by month' }).getByRole('row'),
  ).toHaveCount(1 + 13);
  await expect(github.getByRole('link', { name: 'smartblog-ai' })).toHaveAttribute(
    'href',
    'https://github.com/bhoomi/smartblog-ai',
  );
  await expect(github).toContainText('JavaScript · 3 stars · pushed 20 Oct');
  await expect(github).toContainText('From GitHub, as of 22 Oct, 14:07 UTC');
  // A year of weeks scrolls inside its box; the page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});

test("Lighthouse: each page's scores with their rating in words, and the run", async ({ page }) => {
  await withData(page);
  const scores = region(page, "This site's Lighthouse scores");
  const rows = scores.getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toHaveText('/99 (good)100 (good)96 (good)100 (good)');
  await expect(rows.nth(2)).toHaveText('/reels/72 (needs work)100 (good)96 (good)45 (poor)');
  await expect(scores.getByRole('link', { name: 'see the run' })).toHaveAttribute(
    'href',
    lighthouse.source,
  );
  await expect(scores).toContainText('Measured by Lighthouse 12.6.1');
  await expect(scores).toContainText('as of 22 Oct, 13:00 UTC');
});

test("this site's real totals, from its database, with when", async ({ page }) => {
  const stats = page.waitForResponse('**/api/stats');
  await withData(page);
  const body = (await (await stats).json()) as { totals: Record<string, number> };
  const totals = region(page, 'On this site');
  await expect(totals.locator('[data-total]')).toHaveText(
    ['likes', 'comments', 'answered', 'votes'].map((k) => body.totals[k].toLocaleString('en')),
  );
  await expect(totals).toContainText(`Conversations she answered, of ${body.totals.conversations}`);
  await expect(totals).toContainText(/From this site's database, as of \d+ \w+, \d\d:\d\d UTC/);
});

test('her résumé figures, each with its line, and the post that tells it', async ({ page }) => {
  await withData(page);
  const resume = region(page, 'From her résumé');
  const verified = Object.values(figures).filter((f) => f.verified);
  await expect(resume.locator('.tile')).toHaveCount(verified.length);
  const smartblog = posts.find((p) => p.id === 'smartblog-ai')!;
  const tile = resume.locator('.tile', { hasText: 'fewer redundant network calls' });
  await expect(tile.getByRole('link', { name: 'See the post' })).toHaveAttribute(
    'href',
    `/p/${smartblog.id}/`,
  );
  await expect(resume).toContainText('From her résumé, as of 2026.');
});

test('with nothing to show, each panel says so, never a made-up number', async ({ page }) => {
  await page.route('**/api/stats', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'unavailable' } }),
  );
  await page.goto('/insights/');
  await expect(region(page, 'GitHub')).toContainText('unavailable right now');
  await expect(region(page, "This site's Lighthouse scores")).toContainText('Not measured yet');
  await expect(region(page, 'On this site')).toContainText("This site's totals are unavailable");
  for (const name of ['GitHub', "This site's Lighthouse scores", 'On this site']) {
    await expect(region(page, name).locator('.value:visible')).toHaveCount(0);
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the full dashboard has no serious accessibility issues (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await withData(page);
    await expect(region(page, 'GitHub').getByRole('img')).toBeVisible();
    await expect(region(page, "This site's Lighthouse scores").getByRole('table')).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .include('main')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
