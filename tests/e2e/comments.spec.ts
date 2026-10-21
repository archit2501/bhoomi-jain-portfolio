import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { INBOX_PORT, posts } from './fixtures';
import { ownIp, stubTurnstile } from './live';

// Comments with Bhoomi's approval (task 3.1.3), against the local database. Her approve and
// reject links normally reach her by Telegram or webhook; here the preview Worker posts them to a
// local inbox (scripts/e2e-inbox.mjs), and the tests follow the very links it generated.
const post = posts.find((p) => p.data.tldr) ?? posts[0];
const view = (page: Page) => page.locator('.post-view').first();

interface Notice {
  title: string;
  lines: string[];
  links?: { label: string; url: string }[];
}

/** The link Bhoomi would get for this comment, as a path on the preview server. */
async function linkFor(request: APIRequestContext, body: string, label: 'Approve' | 'Reject') {
  let notice: Notice | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(`http://localhost:${INBOX_PORT}/notices`);
      const notices = (await res.json()) as Notice[];
      notice = notices.find((n) => n.lines.includes(body));
      return Boolean(notice);
    })
    .toBe(true);
  const url = new URL(notice!.links!.find((l) => l.label === label)!.url);
  return url.pathname + url.search;
}

test.beforeEach(async ({ page }, testInfo) => {
  await stubTurnstile(page);
  await ownIp(page, testInfo);
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('a comment waits for Bhoomi, then appears once she approves it', async ({
    page,
    request,
  }, testInfo) => {
    const body = `Great write-up (${testInfo.project.name} ${Date.now()})`;
    await page.goto(`/p/${post.id}/`);
    const form = view(page).locator('.compose .comment-form');
    await form.getByLabel('Your name').fill('Asha');
    await form.getByLabel('Add a comment').fill(body);
    await form.getByRole('button', { name: 'Post' }).click();
    await expect(form.locator('.comment-status')).toHaveText(
      'Thanks! Bhoomi will read it before it appears.',
    );
    // Shown to its writer straight away, marked as waiting, and in no one else's page.
    const mine = view(page).locator('.comments .visitor-comment', { hasText: body });
    await expect(mine).toContainText('Waiting for Bhoomi’s approval');
    await page.reload();
    await expect(view(page).locator('.comments')).not.toContainText(body);

    // Her link opens a page with one button; nothing happens until she presses it.
    await page.goto(await linkFor(request, body, 'Approve'));
    await expect(page.getByRole('heading', { name: 'Approve this comment?' })).toBeVisible();
    await expect(page.locator('blockquote')).toHaveText(body);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('heading', { name: 'Approved' })).toBeVisible();

    await page.goto(`/p/${post.id}/`);
    const approved = view(page).locator('.comments .visitor-comment', { hasText: body });
    await expect(approved).toContainText('Asha');
    await expect(approved).not.toContainText('Waiting');
    // The name is remembered for next time.
    await expect(view(page).locator('.compose .comment-name')).toHaveValue('Asha');
  });

  test('a rejected comment never appears, and a used link stays used', async ({
    page,
    request,
  }, testInfo) => {
    const body = `please ignore (${testInfo.project.name} ${Date.now()})`;
    await page.goto(`/p/${post.id}/`);
    const form = view(page).locator('.compose .comment-form');
    await form.getByLabel('Your name').fill('Spam');
    await form.getByLabel('Add a comment').fill(body);
    await form.getByLabel('Add a comment').press('Enter');
    await expect(form.locator('.comment-status')).toHaveText(/Thanks!/);
    await page.goto(await linkFor(request, body, 'Reject'));
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('heading', { name: 'Rejected' })).toBeVisible();
    await page.goto(await linkFor(request, body, 'Approve'));
    await expect(page.getByRole('heading', { name: 'Already rejected' })).toBeVisible();
    await page.goto(`/p/${post.id}/`);
    await expect(view(page).locator('.comments')).not.toContainText(body);
  });

  test('a forged or expired link does nothing', async ({ page }) => {
    const res = await page.goto('/api/comments/decide?id=x&action=approve&exp=1&sig=forged');
    expect(res?.status()).toBe(400);
  });

  test('the server saying no is explained, and an off switch hides the form', async ({ page }) => {
    await page.route('**/api/comments/**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 429, json: { ok: false, error: 'rate_limited' } })
        : route.fallback(),
    );
    await page.goto(`/p/${post.id}/`);
    const form = view(page).locator('.compose .comment-form');
    await form.getByLabel('Your name').fill('Quick');
    await form.getByLabel('Add a comment').fill('Hello');
    await form.getByRole('button', { name: 'Post' }).click();
    await expect(form.locator('.comment-status')).toHaveText(
      'That was quick. Try again in a minute.',
    );

    await page.unroute('**/api/comments/**');
    await page.route('**/api/comments/**', (route) =>
      route.fulfill({ status: 503, json: { ok: false, error: 'disabled' } }),
    );
    await page.reload();
    await expect(form).toBeHidden();
    await expect(view(page).getByRole('button', { name: 'Comment', exact: true })).toBeHidden();
  });

  test('empty fields are caught before sending', async ({ page }) => {
    await page.goto(`/p/${post.id}/`);
    const form = view(page).locator('.compose .comment-form');
    await form.getByLabel('Your name').fill('');
    await form.getByLabel('Add a comment').fill('No name');
    await form.getByRole('button', { name: 'Post' }).click();
    await expect(form.locator('.comment-status')).toHaveText(/Add your name/);
    await expect(form.getByLabel('Your name')).toBeFocused();
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('comments open in a bottom sheet with her pinned comment first', async ({ page }) => {
    await page.goto(`/p/${post.id}/`);
    await expect(view(page).locator('.compose .comment-form')).toBeHidden();
    await view(page).getByRole('button', { name: 'Comment', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Comments' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.comment-body')).toBeFocused();
    if (post.data.tldr) {
      const first = sheet.locator('.sheet-body > :first-child');
      await expect(first).toContainText(post.data.tldr);
      await expect(first).toContainText('Pinned');
    }
    const { violations } = await new AxeBuilder({ page }).include('.comments-sheet').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  });

  test('a comment sent from the sheet shows there, waiting for approval', async ({
    page,
  }, testInfo) => {
    const body = `From my phone (${testInfo.project.name} ${Date.now()})`;
    await page.goto(`/p/${post.id}/`);
    await view(page).locator('.open-comments').click();
    const sheet = page.getByRole('dialog', { name: 'Comments' });
    await sheet.getByLabel('Your name').fill('Mira');
    await sheet.getByLabel('Add a comment').fill(body);
    await sheet.getByRole('button', { name: 'Post' }).click();
    await expect(sheet.locator('.visitor-comment', { hasText: body })).toContainText(
      'Waiting for Bhoomi’s approval',
    );
  });
});
