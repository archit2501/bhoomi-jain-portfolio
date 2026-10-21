import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { FIRST_NAME, INBOX_PORT, posts } from './fixtures';
import { ownIp, stubTurnstile } from './live';

// "Ask my AI" (task 3.2.3). The preview Worker's Claude API is the stand-in in
// scripts/e2e-inbox.mjs (ANTHROPIC_BASE_URL in .dev.vars.example): canned answers, streamed the
// way the Messages API streams them, so no test calls the real API or spends anything.

interface SentRequest {
  apiKey: string;
  body: {
    model: string;
    output_config?: { effort?: string };
    system: { type: string; text: string; cache_control?: { type: string } }[];
    messages: {
      role: string;
      content: string | { type: string; title?: string; text?: string; cache_control?: unknown }[];
    }[];
  };
}

const pane = (page: Page) => page.locator('.dm-pane');
const field = (page: Page) => pane(page).getByLabel('Question for the AI');
const answers = (page: Page) => pane(page).locator('.from-ai:not([data-ai-opener])');
// Grid order, as the route sends them: pinned first.
const grid = [...posts].sort(
  (a, b) => Number(b.data.pinned) - Number(a.data.pinned) || a.data.order - b.data.order,
);
const firstPost = grid[0];

/** A question no other test or device asks, to find its request at the stand-in. */
const unique = (testInfo: TestInfo, text: string) =>
  `${text} (${testInfo.project.name} ${Date.now() % 100000})`;

async function sent(page: Page, question: string): Promise<SentRequest> {
  let found: SentRequest | undefined;
  await expect
    .poll(async () => {
      const all = (await (
        await page.request.get(`http://localhost:${INBOX_PORT}/anthropic/requests`)
      ).json()) as SentRequest[];
      found = all.find((r) => {
        const last = r.body.messages.at(-1)!.content;
        return (typeof last === 'string' ? last : last.at(-1)!.text) === question;
      });
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}

async function open(page: Page) {
  await page.goto('/direct/ask-ai/');
  await expect(field(page)).toBeEnabled();
}

async function ask(page: Page, question: string) {
  await field(page).fill(question);
  await field(page).press('Enter');
  await expect(pane(page).locator('.from-you .bubble').last()).toHaveText(`You: ${question}`);
}

test.beforeEach(async ({ page }, testInfo) => {
  await stubTurnstile(page);
  await ownIp(page, testInfo);
});

test('it says plainly that it is an AI, what it knows, and where questions go', async ({
  page,
}) => {
  await open(page);
  await expect(pane(page).getByRole('heading', { level: 1 })).toHaveText(`Ask ${FIRST_NAME}'s AI`);
  await expect(pane(page).locator('.topic')).toHaveText('AI · answers from her résumé and posts');
  const safety = pane(page).locator('.safety');
  await expect(safety).toContainText(`An AI, not ${FIRST_NAME}`);
  await expect(safety).toContainText('it can get things wrong');
  await expect(safety).toContainText("Claude, Anthropic's AI model, and aren't saved on this site");
  await expect(pane(page).locator('[data-ai-opener] .bubble')).toContainText("I'm an AI assistant");
  // Her own conversations' form isn't here; nothing asks for a name or an email.
  await expect(pane(page).locator('[data-dm-form]')).toHaveCount(0);
  await expect(pane(page).getByLabel('Your name')).toHaveCount(0);
});

test('an answer streams in, with the sources it used as links', async ({ page }, testInfo) => {
  await open(page);
  const question = unique(testInfo, 'What has she built?');
  await ask(page, question);
  const answer = answers(page).last();
  await expect(answer.locator('.bubble')).toContainText('From what she has published:');
  await expect(answer.locator('.bubble')).toContainText(`${firstPost.data.title} is one of`);
  const sources = answer.getByRole('list', { name: 'Sources' }).getByRole('link');
  await expect(sources).toHaveText(['Résumé', firstPost.data.title]);
  await expect(sources.first()).toHaveAttribute('href', '/');
  await expect(sources.last()).toHaveAttribute('href', `/p/${firstPost.id}/`);
  await expect(pane(page).locator('[data-messages]')).not.toHaveAttribute('aria-busy');

  // What reached the Claude API: Haiku at low effort, rules and documents cached, her résumé
  // and posts as citable documents ahead of the question.
  const { apiKey, body } = await sent(page, question);
  expect(apiKey).toBe('e2e-stand-in-key');
  expect(body.model).toBe('claude-haiku-5-5');
  expect(body.output_config).toEqual({ effort: 'low' });
  expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  const blocks = body.messages[0].content as { type: string; title?: string }[];
  expect(blocks.filter((b) => b.type === 'document').map((b) => b.title)).toEqual([
    'Résumé',
    ...grid.map((p) => p.data.title),
  ]);
  expect(JSON.stringify(body)).not.toMatch(/\+?91[\s-]?\d{5}/);
});

test('a suggestion asks it; a follow-up carries the conversation; a reload keeps it', async ({
  page,
}, testInfo) => {
  await open(page);
  const suggestions = pane(page).locator('[data-ai-suggestions]');
  const first = suggestions.getByRole('button').first();
  const asked = (await first.textContent())!.trim();
  await first.click();
  await expect(suggestions).toBeHidden();
  await expect(answers(page)).toHaveCount(1);
  await expect(answers(page).last().locator('.bubble')).toContainText(`(Answering: ${asked}`);

  const followUp = unique(testInfo, 'And which stack?');
  await ask(page, followUp);
  await expect(answers(page)).toHaveCount(2);
  await expect(answers(page).last().getByRole('link').first()).toBeVisible();
  const { body } = await sent(page, followUp);
  expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(body.messages[1].content).toContain('From what she has published:');

  // Once the answer is complete, it's kept for this tab.
  await expect(pane(page).locator('[data-messages]')).not.toHaveAttribute('aria-busy');
  await page.reload();
  await expect(pane(page).locator('.from-you')).toHaveCount(2);
  await expect(answers(page)).toHaveCount(2);
  await expect(suggestions).toBeHidden();

  // "New chat" clears it, back to the opener and the suggestions.
  await pane(page).getByRole('button', { name: 'New chat' }).click();
  await expect(pane(page).locator('.from-you')).toHaveCount(0);
  await expect(answers(page)).toHaveCount(0);
  await expect(suggestions).toBeVisible();
  await expect(pane(page).getByRole('button', { name: 'New chat' })).toBeHidden();
  await page.reload();
  await expect(pane(page).locator('.from-you')).toHaveCount(0);
});

test('a refusal is a polite note, and isn’t sent back as context', async ({ page }, testInfo) => {
  await open(page);
  await ask(page, unique(testInfo, 'Please refuse this'));
  const note = answers(page).last().locator('.ai-note');
  await expect(note).toHaveText(/can't help with that one/);
  await expect(answers(page).last().locator('.bubble')).toHaveCount(0);

  const next = unique(testInfo, 'What has she built?');
  await ask(page, next);
  await expect(answers(page)).toHaveCount(2);
  const { body } = await sent(page, next);
  expect(body.messages).toHaveLength(1);
});

test('a failed answer says so and gives the question back', async ({ page }, testInfo) => {
  await open(page);
  const question = unique(testInfo, 'This one will fail');
  await ask(page, question);
  await expect(pane(page).locator('[data-ai-status]')).toHaveText(
    "Couldn't get an answer. Try again.",
  );
  await expect(field(page)).toHaveValue(question);
  await expect(pane(page).locator('.from-you')).toHaveCount(0);
  await expect(answers(page)).toHaveCount(0);
});

test('switched off, it says so before anyone types', async ({ page }) => {
  await page.route('**/api/ai', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { ok: true, on: false } })
      : route.fallback(),
  );
  await page.goto('/direct/ask-ai/');
  await expect(pane(page).locator('[data-ai-off]')).toBeVisible();
  await expect(pane(page).locator('[data-ai-off]')).toContainText('off right now');
  await expect(field(page)).toBeDisabled();
  await expect(pane(page).locator('[data-ai-suggestions]')).toBeHidden();
});

test('without JavaScript, it points to her email and LinkedIn', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/direct/ask-ai/');
  await expect(pane(page).locator('.ai-fallback')).toBeVisible();
  await expect(pane(page).getByRole('link', { name: 'LinkedIn' })).toBeVisible();
  await expect(pane(page).locator('[data-ai-form]')).toBeHidden();
  await context.close();
});

test('the conversation has no serious accessibility issues', async ({ page }, testInfo) => {
  await open(page);
  await ask(page, unique(testInfo, 'What has she built?'));
  await expect(answers(page).last().getByRole('link').first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('main').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
