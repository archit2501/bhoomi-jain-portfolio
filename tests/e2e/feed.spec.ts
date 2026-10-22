import { expect, test, type Page } from '@playwright/test';
import { feedOrder, lensesOf } from '../../src/lib/feed';
import { highlights, posts, profile, resume, row } from './fixtures';
import { ownIp, stubTurnstile } from './live';

// Home as a dev log (task 4.1.3): the stories tray, the feed cards, "You're all caught up", and
// on wide screens the rail with the lens switch.

const ordered = feedOrder(posts);
const cards = (page: Page) => page.locator('[data-feed] .feed-card');
const intro = highlights.find((h) => !h.data.inRow);

test.beforeEach(async ({ page }, testInfo) => {
  await stubTurnstile(page);
  await ownIp(page, testInfo);
});

test('her work, newest first, each card with its parts', async ({ page }) => {
  await page.goto('/feed/');
  await expect(cards(page).locator('h2')).toHaveText(ordered.map((p) => p.data.title));
  const first = cards(page).first();
  await expect(first.locator('.card-head .username')).toHaveText(profile.username);
  await expect(first.getByRole('button', { name: 'Like' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(first.getByRole('button', { name: 'Comment' })).toBeVisible();
  await expect(first.getByRole('link', { name: 'View comments' })).toHaveAttribute(
    'href',
    `/p/${ordered[0].id}/`,
  );
  // Offscreen cards skip rendering until they're near, and never widen the page.
  await expect(cards(page).last()).toHaveCSS('content-visibility', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});

test('a long caption opens with "more"', async ({ page }) => {
  await page.goto('/feed/');
  const cut = cards(page)
    .filter({ has: page.locator('[data-more]:not([hidden])') })
    .first();
  test.skip((await cut.count()) === 0, 'every caption fits in two lines');
  // Hold on to this card: once it's open, the filter above would find the next one.
  const title = (await cut.locator('h2').textContent())!.trim();
  const card = cards(page).filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const caption = card.locator('[data-caption]');
  const before = (await caption.boundingBox())!.height;
  await card.getByRole('button', { name: 'more' }).click();
  await expect(card.getByRole('button', { name: 'more' })).toBeHidden();
  expect((await caption.boundingBox())!.height).toBeGreaterThan(before);
});

test('a caption far down the feed gets "more" once it scrolls into view', async ({ page }) => {
  await page.goto('/feed/');
  const last = cards(page).last();
  await last.scrollIntoViewIfNeeded();
  const caption = last.locator('[data-caption]');
  await expect
    .poll(async () =>
      caption.evaluate((el) => (el.scrollHeight > el.clientHeight + 1 ? 'cut' : 'fits')),
    )
    .toMatch(/cut|fits/);
  const cut = await caption.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  await expect(last.getByRole('button', { name: 'more' })).toBeVisible({ visible: cut });
});

test('the tray opens her stories in the viewer', async ({ page }) => {
  await page.goto('/feed/');
  const tray = page.getByRole('navigation', { name: 'Stories' });
  await expect(tray.getByRole('link')).toHaveCount(row.length + (intro ? 1 : 0));
  await tray.getByRole('link', { name: new RegExp(`^Highlight: ${row[0].data.label}, `) }).click();
  await expect(page.locator('#story-viewer')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/stories/${row[0].id}/`));
});

test('a like from the feed is saved; Comment goes to the post', async ({ page }) => {
  await page.goto('/feed/');
  const first = cards(page).first();
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/likes/') && r.request().method() === 'POST' && r.ok(),
  );
  await first.getByRole('button', { name: 'Like' }).click();
  await expect(first.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'true');
  await saved;
  await page.reload();
  await expect(cards(page).first().getByRole('button', { name: 'Like' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await cards(page).first().getByRole('button', { name: 'Comment' }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${ordered[0].id}/$`));
});

test("the end says you're all caught up, with the way to her profile", async ({ page }) => {
  await page.goto('/feed/');
  const end = page.getByRole('region', { name: "You're all caught up" });
  await expect(end).toContainText(
    `You've seen all of ${profile.displayName.split(' ')[0]}'s posts.`,
  );
  await expect(end.getByRole('link', { name: 'View her profile' })).toHaveAttribute('href', '/');
});

test.describe('wide screens', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('the rail: her mini profile, and a lens switch that narrows the feed', async ({ page }) => {
    await page.goto('/feed/');
    const rail = page.getByRole('complementary', { name: 'About this feed' });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('link', { name: new RegExp(profile.username) })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(rail).toContainText('Not affiliated with Instagram or Meta.');

    for (const lens of ['frontend', 'backend', 'ai'] as const) {
      const expected = ordered.filter((p) => lensesOf(p, resume).includes(lens));
      await rail
        .getByRole('radio', {
          name: new RegExp(`^${lens === 'ai' ? 'AI' : lens[0].toUpperCase() + lens.slice(1)} `),
        })
        .check();
      await expect(cards(page).filter({ visible: true }).locator('h2')).toHaveText(
        expected.map((p) => p.data.title),
      );
      await expect(page.locator('[data-feed-status]')).toHaveText(
        `Showing ${expected.length} post${expected.length === 1 ? '' : 's'}`,
      );
    }
    await rail.getByRole('radio', { name: /^All / }).check();
    await expect(cards(page).filter({ visible: true })).toHaveCount(ordered.length);
  });

  test('the lens holds when you come back in the same tab', async ({ page }) => {
    await page.goto('/feed/');
    await page.getByRole('radio', { name: /^AI / }).check();
    await page.goto('/explore/');
    await page.goBack();
    await expect(page.getByRole('radio', { name: /^AI / })).toBeChecked();
    const ai = ordered.filter((p) => lensesOf(p, resume).includes('ai'));
    await expect(cards(page).filter({ visible: true })).toHaveCount(ai.length);
  });
});

test('below 1160px there is no rail', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/feed/');
  await expect(page.getByRole('complementary', { name: 'About this feed' })).toBeHidden();
});
