import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { careerActivity, newestFirst } from '../../src/lib/events';
import type { GithubSnapshot } from '../../src/lib/github';
import { posts } from './fixtures';
import { readFileSync } from 'node:fs';

// Notifications (task 4.2.3): her career milestones, GitHub events and approved comments,
// merged newest first and grouped New / Today / This week / Earlier, each linking to its source.

const events = Object.entries(
  JSON.parse(readFileSync('src/content/events.json', 'utf8')) as Record<string, never>,
).map(([id, data]) => ({ id, data }));
// Newest first, as the page lists them.
const career = newestFirst(careerActivity(events, posts));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const smartblog = posts.find((p) => p.id === 'smartblog-ai')!;

function snapshot(): GithubSnapshot {
  return {
    version: 1,
    fetchedAt: hoursAgo(0.5),
    login: 'bhoomi',
    name: null,
    url: 'https://github.com/bhoomi',
    days: [],
    contributionsLastYear: 0,
    commitsThisYear: 0,
    publicRepos: 0,
    repos: [],
    events: [
      {
        id: 'g1',
        summary: 'pushed 2 commits to main',
        repo: 'bhoomi/smartblog-ai',
        url: 'https://github.com/bhoomi/smartblog-ai',
        at: hoursAgo(1),
      },
      {
        id: 'g2',
        summary: 'created a repository',
        repo: 'bhoomi/notes',
        url: 'https://github.com/bhoomi/notes',
        at: hoursAgo(24 * 3),
      },
    ],
  };
}

async function withActivity(page: Page) {
  await page.route('**/api/github', (route) =>
    route.fulfill({ json: { ok: true, snapshot: snapshot() } }),
  );
  await page.route('**/api/activity', (route) =>
    route.fulfill({
      json: {
        ok: true,
        comments: [
          {
            id: 'c1',
            post: smartblog.id,
            name: 'Priya',
            excerpt: 'Loved the caching write-up',
            at: hoursAgo(2),
          },
        ],
      },
    }),
  );
}
const list = (page: Page) => page.locator('main [data-activity]');
const group = (page: Page, name: string) => list(page).getByRole('region', { name, exact: true });

test('without JavaScript, her milestones, each linking to the post that tells it', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/notifications/');
  const rows = list(page).locator('.row');
  await expect(rows).toHaveCount(career.length);
  const hrefs = await rows.evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  expect([...hrefs].sort()).toEqual(career.map((c) => c.href).sort());
  // Newest first (milestones from the same year may come in any order).
  const dates = await list(page)
    .locator('.when')
    .evaluateAll((els) => els.map((el) => el.getAttribute('datetime')!));
  expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  await expect(group(page, 'Earlier')).toBeVisible();
  // Under the page's h1 the groups are h2 (in the drawer, under its h2, they're h3).
  await expect(list(page).getByRole('heading', { level: 2, name: 'Earlier' })).toBeVisible();
  await context.close();
});

test('GitHub and comments join in, newest first, grouped by when', async ({ page }) => {
  await withActivity(page);
  await page.goto('/notifications/');
  const today = group(page, 'Today');
  await expect(today.locator('.text')).toHaveText([
    'pushed 2 commits to main in bhoomi/smartblog-ai',
    `Priya commented on ${smartblog.data.title}: “Loved the caching write-up”`,
  ]);
  await expect(today.locator('.when')).toHaveText(['1h', '2h']);
  await expect(group(page, 'This week').locator('.text')).toHaveText([
    'created a repository in bhoomi/notes',
  ]);
  await expect(group(page, 'Earlier').locator('.row')).toHaveCount(career.length);

  const push = today.getByRole('link', { name: /pushed 2 commits/ });
  await expect(push).toHaveAttribute('href', 'https://github.com/bhoomi/smartblog-ai');
  await expect(push).toHaveAttribute('target', '_blank');
  await expect(push).toContainText('(opens GitHub)');
  await expect(today.getByRole('link', { name: /Priya commented/ })).toHaveAttribute(
    'href',
    `/p/${smartblog.id}/`,
  );
});

test('"New" is what came since this browser last looked', async ({ page }) => {
  await withActivity(page);
  await page.addInitScript(
    (seen) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('bhoomi:notifications-seen', String(seen));
        sessionStorage.setItem('seeded', '1');
      }
    },
    Date.now() - 1.5 * 3600_000,
  );
  await page.goto('/notifications/');
  await expect(group(page, 'New').locator('.text')).toHaveText([
    'pushed 2 commits to main in bhoomi/smartblog-ai',
  ]);
  // Having looked, the next visit has nothing new.
  await page.reload();
  await expect(group(page, 'Today').locator('.row')).toHaveCount(2);
  await expect(group(page, 'New')).toHaveCount(0);
});

test.describe('the drawer', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('asks for activity only when it opens', async ({ page }) => {
    await withActivity(page);
    const asked: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/activity')) asked.push(r.url());
    });
    await page.goto('/');
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
    await page.locator('nav.side-nav').getByRole('link', { name: 'Notifications' }).click();
    const drawer = page.getByRole('dialog', { name: 'Notifications' });
    await expect(drawer.getByRole('region', { name: 'Today', exact: true })).toBeVisible();
    expect(asked).toHaveLength(1);
    await expect(drawer).toHaveCSS('opacity', '1');
    const { violations } = await new AxeBuilder({ page }).include('#panel-notifications').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
