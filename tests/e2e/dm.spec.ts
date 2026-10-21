import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BASE, profile } from './fixtures';
import { inboxLink, ownIp, stubTurnstile } from './live';
import { readFileSync } from 'node:fs';
import type { DmThread } from '../../src/lib/content-schema';

// Messages as the contact hub (task 3.2.1), against the local database. Bhoomi's notices reach
// the local inbox (scripts/e2e-inbox.mjs); the tests follow her reply link from there.
const threads = Object.entries(
  JSON.parse(readFileSync('src/content/dm-threads.json', 'utf8')) as Record<string, DmThread>,
)
  .map(([id, data]) => ({ id, data }))
  .sort((a, b) => a.data.order - b.data.order);
const human = threads.filter((t) => !t.data.ai);
const ai = threads.find((t) => t.data.ai);
const firstName = profile.displayName.split(/\s+/)[0];
const pane = (page: Page) => page.locator('.dm-pane');

test.beforeEach(async ({ page }, testInfo) => {
  await stubTurnstile(page);
  await ownIp(page, testInfo);
});

/** Sends a first message on a topic and lands on the private conversation. */
async function startConversation(page: Page, topic: string, body: string) {
  await page.goto(`/direct/${topic}/`);
  await pane(page).getByLabel('Your name').fill('Priya');
  await pane(page)
    .getByLabel(/Your email/)
    .fill('priya@example.com');
  await pane(page).getByLabel('Message', { exact: true }).fill(body);
  await pane(page).getByRole('button', { name: 'Send' }).click();
  await expect(page).toHaveURL(/\/direct\/thread\/#[\w-]+\.[\w-]+$/);
  await expect(pane(page).locator('.from-you .bubble', { hasText: body })).toBeVisible();
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('the inbox lists her topics; each opens with her opening line', async ({ page }) => {
    await page.goto('/direct/');
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
    const rows = page.locator('.dm-list').getByRole('link');
    for (const thread of threads) {
      await expect(rows.filter({ hasText: thread.data.label })).toBeVisible();
    }
    await rows.filter({ hasText: human[0].data.label }).click();
    await expect(page).toHaveURL(new RegExp(`/direct/${human[0].id}/$`));
    await expect(pane(page).getByRole('heading', { name: `Message ${firstName}` })).toBeVisible();
    await expect(pane(page).locator('.from-her .bubble')).toContainText(human[0].data.opener);
    await expect(rows.filter({ hasText: human[0].data.label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('says where a message goes and asks for nothing it should not', async ({ page }) => {
    await page.goto(`/direct/${human[0].id}/`);
    const safety = pane(page).locator('.safety');
    await expect(safety).toContainText(`Goes straight to ${firstName}`);
    await expect(safety).toContainText('only she reads it');
    await expect(safety).toContainText('never ask for a password or account details');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    for (const label of await pane(page).locator('label').allInnerTexts()) {
      expect(label).not.toMatch(/password|handle|username|instagram/i);
    }
    // Instagram calls these "Direct"; this site never does.
    expect(await page.locator('body').innerText()).not.toMatch(/\bDirect\b/);
  });

  test('a message reaches Bhoomi, and her reply shows on the private link', async ({
    page,
    request,
  }, testInfo) => {
    const body = `Open to a frontend role? (${testInfo.project.name} ${Date.now()})`;
    await startConversation(page, human[0].id, body);
    const privateUrl = page.url();
    await expect(pane(page).locator('[data-private-url]')).toHaveValue(privateUrl);

    // Her link opens the conversation and a reply box.
    await page.goto(await inboxLink(request, body, 'Read and reply'));
    await expect(page.locator('blockquote', { hasText: body })).toBeVisible();
    await expect(page.locator('a[href="mailto:priya@example.com"]')).toBeVisible();
    await page.getByLabel('Your reply').fill('Thanks Priya! Yes, happy to talk.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('heading', { name: 'Reply sent' })).toBeVisible();

    // The visitor's private link shows it, after their message, from her side.
    await page.goto(privateUrl);
    const theirs = pane(page).locator('.from-her .bubble', { hasText: 'happy to talk' });
    await expect(theirs).toBeVisible();
    await expect(pane(page).locator('.msg').last()).toHaveClass(/from-her/);

    // And they can write again on the same thread.
    await pane(page).getByLabel('Message', { exact: true }).fill('Great, my email is above.');
    await pane(page).getByLabel('Message', { exact: true }).press('Enter');
    await expect(pane(page).locator('.msg').last()).toContainText('Great, my email is above.');
    await expect(pane(page).locator('.msg').last()).toHaveClass(/from-you/);
  });

  test('conversations this browser started are listed first', async ({ page }) => {
    const body = `Just saying hi (${Date.now()})`;
    await startConversation(page, human[human.length - 1].id, body);
    await page.goto('/direct/');
    const mine = page.locator('[data-my-threads]');
    await expect(mine).toBeVisible();
    await expect(mine.getByRole('link').first()).toContainText(human[human.length - 1].data.label);
    await expect(mine.getByRole('link').first()).toContainText(body);
  });

  test('a wrong private link shows nothing', async ({ page }) => {
    await page.goto('/direct/thread/#not-a-thread.not-a-secret');
    await expect(pane(page).locator('[data-dm-status]')).toHaveText(
      "This conversation can't be found. Check the link.",
    );
    await expect(pane(page).locator('[data-dm-form]')).toBeHidden();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('when messages are switched off, the visitor is told', async ({ page }) => {
    await page.route('**/api/dm', (route) =>
      route.fulfill({ status: 503, json: { ok: false, error: 'disabled' } }),
    );
    await page.goto(`/direct/${human[0].id}/`);
    await pane(page).getByLabel('Your name').fill('Priya');
    await pane(page).getByLabel('Message', { exact: true }).fill('Hello');
    await pane(page).getByRole('button', { name: 'Send' }).click();
    await expect(pane(page).locator('[data-dm-status]')).toHaveText(/Messages are off for now/);
    await expect(page).toHaveURL(new RegExp(`/direct/${human[0].id}/$`));
  });

  test('the AI conversation has no message form yet', async ({ page }) => {
    test.skip(!ai, 'no AI topic');
    await page.goto(`/direct/${ai!.id}/`);
    await expect(pane(page).locator('.soon')).toBeVisible();
    await expect(pane(page).locator('[data-dm-form]')).toHaveCount(0);
  });

  test('a conversation page has no serious accessibility issues', async ({ page }) => {
    await page.goto(`/direct/${human[0].id}/`);
    const { violations } = await new AxeBuilder({ page }).include('main').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the list first; a topic opens on its own with a way back', async ({ page }) => {
    await page.goto('/direct/');
    await expect(page.locator('.dm-list')).toBeVisible();
    await expect(page.locator('.dm-main')).toBeHidden();
    await page
      .locator('.dm-list')
      .getByRole('link', { name: new RegExp(human[0].data.label) })
      .click();
    await expect(page.locator('.dm-list')).toBeHidden();
    await pane(page).getByRole('link', { name: 'Back to messages' }).click();
    await expect(page).toHaveURL(/\/direct\/$/);
  });
});

test('without JavaScript, a topic offers her email and LinkedIn instead of a form', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${BASE}/direct/${human[0].id}/`);
  await expect(page.locator('[data-dm-form]')).toBeHidden();
  await expect(page.locator('.dm-pane').getByRole('link', { name: /LinkedIn/ })).toBeVisible();
  await context.close();
});
