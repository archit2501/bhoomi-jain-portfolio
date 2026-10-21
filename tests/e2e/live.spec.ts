import { expect, test, type Browser, type Page } from '@playwright/test';
import type { Sticker } from '../../src/lib/content-schema';
import { highlights, INBOX_PORT } from './fixtures';
import { ownIp, stubTurnstile, type Notice } from './live';

// The live layer (task 3.2.2): "Active now" from the Presence Durable Object, and the story's
// poll, question box and emoji slider. One device runs it: every project shares the live room
// and the database, so counts are checked as "at least" and "went up", never exact.
test.skip(
  ({ browserName, isMobile, viewport }) =>
    browserName !== 'chromium' || isMobile || viewport?.width !== 1280,
  'the laptop project only',
);

type Found = { highlight: (typeof highlights)[number]; frame: number; sticker: Sticker };
function find(type: 'poll' | 'question' | 'slider'): Found | undefined {
  for (const highlight of highlights) {
    for (const [frame, data] of highlight.data.frames.entries()) {
      const sticker = (data.stickers ?? []).find((s) => s.type === type);
      if (sticker) return { highlight, frame, sticker };
    }
  }
  return undefined;
}

const viewer = (page: Page) => page.locator('#story-viewer');
const frame = (page: Page) => viewer(page).locator('.card:not(.face-out) .frame.active');

async function visitor(browser: Browser, testInfo: Parameters<typeof ownIp>[1]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await stubTurnstile(page);
  await ownIp(page, testInfo);
  return { page, close: () => context.close() };
}

/** Opens a highlight's story at one frame, paused so it stays put. */
async function openAt(page: Page, found: Found) {
  await page.goto('/');
  if (found.highlight.data.inRow) {
    await page.locator(`a.highlight[data-story="${found.highlight.id}"]`).click();
  } else {
    await page.locator('a.avatar-link').click();
  }
  await expect(viewer(page)).not.toHaveClass(/zooming/);
  await viewer(page).getByRole('button', { name: 'Pause' }).click();
  for (let i = 0; i < found.frame; i++) {
    await viewer(page).getByRole('button', { name: 'Next story' }).click();
  }
  await expect(frame(page).locator(`[data-sticker="${found.sticker.type}"]`)).toBeVisible();
}

const total = async (page: Page) =>
  Number((await frame(page).locator('.live-status').innerText()).match(/^(\d+)/)?.[1] ?? 0);

test('"Active now" lights up and counts the people here', async ({ browser }, testInfo) => {
  const a = await visitor(browser, testInfo);
  await a.page.goto('/');
  const label = a.page.locator('.active-now');
  await expect(label).toBeVisible();
  await expect(label).toHaveText(/^Active now · /);
  await expect(a.page.locator('.active-dot')).toBeVisible();

  const b = await visitor(browser, testInfo);
  await b.page.goto('/feed/');
  await expect
    .poll(async () => Number((await label.innerText()).match(/(\d+) here/)?.[1] ?? 1))
    .toBeGreaterThanOrEqual(2);
  await a.close();
  await b.close();
});

test('"Active now" lighting up moves nothing on the page', async ({ browser }, testInfo) => {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 1280, height: 860 },
  ]) {
    const positions: unknown[] = [];
    for (const live of [false, true]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await ownIp(page, testInfo);
      if (!live) await page.routeWebSocket('**/api/live', (ws) => ws.close());
      await page.goto('/');
      if (live) await expect(page.locator('.active-now')).toBeVisible();
      else await page.waitForTimeout(500);
      positions.push(
        await page.evaluate(() =>
          ['.category', '.bio', '.highlights', '.profile-tabs'].map((selector) => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box && [selector, Math.round(box.top), Math.round(box.height)];
          }),
        ),
      );
      await context.close();
    }
    expect(positions[1], `at ${viewport.width}px`).toEqual(positions[0]);
  }
});

test('with no live room, there is no "Active now"', async ({ page }) => {
  await page.routeWebSocket('**/api/live', (ws) => ws.close());
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('.active-now')).toBeHidden();
  await expect(page.locator('.active-dot')).toBeHidden();
});

test('a poll shows results after voting, and updates live as others vote', async ({
  browser,
}, testInfo) => {
  const found = find('poll');
  test.skip(!found, 'no poll sticker in the content');
  const a = await visitor(browser, testInfo);
  await openAt(a.page, found!);
  const poll = frame(a.page).locator('[data-poll]');
  await expect(poll).not.toHaveClass(/voted/);
  await poll.locator('.poll-option').first().click();
  await expect(poll).toHaveClass(/voted/);
  await expect(poll.locator('.poll-option').first()).toHaveAttribute('aria-pressed', 'true');
  const before = await total(a.page);
  expect(before).toBeGreaterThanOrEqual(1);

  // Someone else votes; the first visitor's open poll updates without a reload.
  const b = await visitor(browser, testInfo);
  await openAt(b.page, found!);
  await frame(b.page).locator('[data-poll] .poll-option').last().click();
  await expect(frame(b.page).locator('[data-poll]')).toHaveClass(/voted/);
  await expect.poll(() => total(a.page)).toBeGreaterThanOrEqual(before + 1);

  // Revisiting shows the visitor's own vote and the results straight away.
  await a.page.reload();
  await openAt(a.page, found!);
  await expect(frame(a.page).locator('[data-poll]')).toHaveClass(/voted/);
  await a.close();
  await b.close();
});

test('a question box answer goes to Bhoomi only', async ({ page, request }, testInfo) => {
  const found = find('question');
  test.skip(!found, 'no question sticker in the content');
  await stubTurnstile(page);
  await ownIp(page, testInfo);
  await openAt(page, found!);
  const text = `What are you learning? (${Date.now()})`;
  const box = frame(page).locator('[data-question]');
  await box.getByRole('textbox').fill(text);
  await box.getByRole('button', { name: 'Send' }).click();
  await expect(box.locator('.live-status')).toHaveText('Sent to Bhoomi. Only she sees answers.');
  // Her notice arrives with the answer; the answer is never readable from the API.
  await expect
    .poll(async () => {
      const notices = (await (
        await request.get(`http://localhost:${INBOX_PORT}/notices`)
      ).json()) as Notice[];
      return notices.some((n) => n.title.startsWith('New answer to') && n.lines.includes(text));
    })
    .toBe(true);
  const res = await request.get(
    `/api/polls/${(found!.sticker as Extract<Sticker, { type: 'question' }>).id}`,
  );
  expect(res.status()).toBe(404);
});

test('an emoji slider shows the average once you slide', async ({ page }, testInfo) => {
  const found = find('slider');
  test.skip(!found, 'no slider sticker in the content');
  await stubTurnstile(page);
  await ownIp(page, testInfo);
  await openAt(page, found!);
  const slider = frame(page).locator('[data-slider]');
  await slider.getByRole('slider').fill('90');
  await expect(slider.locator('.live-status')).toHaveText(/^Average \d+ · \d+ answered$/);
});

test('with answers switched off, a sticker says so and nothing changes', async ({
  page,
}, testInfo) => {
  const found = find('poll');
  test.skip(!found, 'no poll sticker in the content');
  await stubTurnstile(page);
  await ownIp(page, testInfo);
  await page.route('**/api/polls/**', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'disabled' } }),
  );
  await openAt(page, found!);
  const poll = frame(page).locator('[data-poll]');
  await poll.locator('.poll-option').first().click();
  await expect(poll.locator('.live-status')).toHaveText('Answers are off for now.');
  await expect(poll).not.toHaveClass(/voted/);
});
