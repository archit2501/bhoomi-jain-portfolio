/**
 * Helpers for tests that write to the live API (likes now; comments and DMs later). The preview
 * server runs on a fresh local database with Cloudflare's Turnstile test secret
 * (scripts/e2e-setup.mjs), and every device project shares it, so each project writes to its
 * own targets.
 */
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { INBOX_PORT } from './fixtures';

const PROJECTS = ['iphone', 'pixel', 'ipad', 'laptop', 'desktop'];

/** 0-4: which device project this test runs in. */
export function projectIndex(testInfo: TestInfo): number {
  const i = PROJECTS.indexOf(testInfo.project.name);
  if (i < 0) throw new Error(`unknown project ${testInfo.project.name}`);
  return i;
}

/**
 * Stands in for Cloudflare's Turnstile script (the network isn't part of these tests): every
 * widget answers with a token, which the server's test secret accepts.
 */
export async function stubTurnstile(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = {
        render(el, options) { setTimeout(() => options.callback('e2e-token'), 10); return 'w' + Math.random(); },
        remove() {},
      };`,
    }),
  );
}

let ipSeed = 0;
/**
 * Gives this page's API calls their own client IP, as Cloudflare would for a real visitor, so
 * the per-IP rate limit (30 writes a minute) applies per test, not to the whole run.
 */
export async function ownIp(page: Page, testInfo: TestInfo): Promise<string> {
  const ip = `10.${projectIndex(testInfo)}.${testInfo.workerIndex % 250}.${++ipSeed % 250}`;
  // allHeaders(), not headers(): the latter leaves out Origin and cookies, which the API checks.
  await page.route('**/api/**', async (route) =>
    route.continue({
      headers: { ...(await route.request().allHeaders()), 'cf-connecting-ip': ip },
    }),
  );
  return ip;
}

export interface Notice {
  title: string;
  lines: string[];
  links?: { label: string; url: string }[];
}

/**
 * The link in Bhoomi's notice about `text` (a comment or a message), as a path on the preview
 * server. The preview Worker posts notices to the local inbox (scripts/e2e-inbox.mjs).
 */
export async function inboxLink(
  request: APIRequestContext,
  text: string,
  label: string,
): Promise<string> {
  let notice: Notice | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(`http://localhost:${INBOX_PORT}/notices`);
      notice = ((await res.json()) as Notice[]).findLast((n) => n.lines.includes(text));
      return Boolean(notice);
    })
    .toBe(true);
  const url = new URL(notice!.links!.find((l) => l.label === label)!.url);
  return url.pathname + url.search;
}
