import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inlineScriptHashes } from '../../src/integrations/security-headers';
import { posts, reels, row, videoReels } from './fixtures';
import { ownIp, stubTurnstile } from './live';

// Security headers (task 6.4.1): every response carries them, the pages' policy lists each inline
// script by hash, and the site still works under it: Turnstile, the live room's WebSocket, reels
// video and the share cards. The service worker under the policy is tested in pwa.spec.ts. This is
// a production build, so nothing says noindex (the preview build's noindex is unit-tested in
// src/integrations/security-headers.test.ts and src/lib/security-headers.test.ts).

const sitemap = [
  ...readFileSync('dist/client/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g),
].map(([, url]) => new URL(url).pathname);
const ROUTES = [...new Set([...sitemap, '/saved/', '/offline/', '/direct/thread/'])];

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

function expectBaseHeaders(res: APIResponse) {
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toMatch(/^(strict-origin-when-cross-origin|same-origin)$/);
  for (const feature of ['camera', 'microphone', 'geolocation']) {
    expect(h['permissions-policy']).toContain(`${feature}=()`);
  }
  expect(h['x-robots-tag']).toBeUndefined();
  return directives(h['content-security-policy'] ?? '');
}

/** Collects every CSP violation the page reports, across navigations. */
async function watchPolicy(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__cspViolation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __cspViolation(v: string): void }).__cspViolation(
        `${location.pathname}: ${e.effectiveDirective} blocked ${e.blockedURI || 'inline'}`,
      ),
    );
  });
  page.on('console', (m) => {
    if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}

test('every page is sent with the security headers and a policy with no inline scripts', async ({
  request,
}) => {
  expect(ROUTES.length).toBeGreaterThan(30);
  for (const path of [...ROUTES, '/no-such-page/']) {
    const res = await request.get(path);
    const csp = expectBaseHeaders(res);
    const scripts = csp.get('script-src') ?? [];
    expect([path, scripts.includes("'unsafe-inline'")]).toEqual([path, false]);
    expect([path, scripts.includes('https://challenges.cloudflare.com')]).toEqual([path, true]);
    expect([path, csp.get('frame-src')]).toEqual([path, ['https://challenges.cloudflare.com']]);
    expect([path, csp.get('frame-ancestors')]).toEqual([path, ["'none'"]]);
    expect([path, csp.get('object-src')]).toEqual([path, ["'none'"]]);
    expect([path, csp.get('base-uri')]).toEqual([path, ["'none'"]]);
    // Every inline script this page runs is allowed by its hash.
    for (const hash of inlineScriptHashes(await res.text())) {
      expect([path, hash, scripts.includes(`'${hash}'`)]).toEqual([path, hash, true]);
    }
  }
});

test('static files and the API carry the headers too; the API loads nothing', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  const asset = /src="(\/_astro\/[^"]+\.js)"/.exec(html)?.[1];
  expect(asset).toBeTruthy();
  for (const path of [
    '/og/default.png',
    '/sw.js',
    '/robots.txt',
    '/manifest.webmanifest',
    asset!,
  ]) {
    const res = await request.get(path);
    expect([path, res.status()]).toEqual([path, 200]);
    expectBaseHeaders(res);
  }
  const csp = expectBaseHeaders(await request.get('/api/health'));
  expect(csp.get('default-src')).toEqual(["'none'"]);
  expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
});

test('production invites crawlers: robots.txt allows every page', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/^Allow: \/$/m);
  expect(robots).not.toMatch(/^Disallow:/m);
});

test('the pages run under the policy without a single violation', async ({ page }) => {
  test.setTimeout(120_000);
  const violations = await watchPolicy(page);
  for (const path of [
    '/',
    '/reels/',
    `/p/${posts[0].id}/`,
    `/stories/${row[0].id}/`,
    `/reels/${reels[0].id}/`,
    '/feed/',
    '/explore/',
    '/direct/',
    '/direct/thread/',
    '/notifications/',
    '/insights/',
    '/saved/',
    '/offline/',
    '/no-such-page/',
  ]) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }
  expect(violations).toEqual([]);
});

test('Turnstile loads under the policy and a like goes through', async ({ page }, testInfo) => {
  const violations = await watchPolicy(page);
  await stubTurnstile(page);
  await ownIp(page, testInfo);
  await page.goto(`/p/${posts[1 % posts.length].id}/`);
  const like = page.locator('.post-view').first().getByRole('button', { name: 'Like' });
  const turnstile = page.waitForRequest(/challenges\.cloudflare\.com\/turnstile/);
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/likes/') && r.request().method() === 'POST',
  );
  await like.click();
  await turnstile;
  expect((await saved).status()).toBe(200);
  await like.click();
  expect(violations).toEqual([]);
});

test("the live room's WebSocket connects under the policy", async ({ page }) => {
  const violations = await watchPolicy(page);
  const socket = page.waitForEvent('websocket');
  await page.goto('/');
  expect(new URL((await socket).url()).pathname).toBe('/api/live');
  expect(violations).toEqual([]);
});

test("a reel's video and the share cards load under the policy", async ({ page }) => {
  test.skip(!videoReels.length, 'needs a reel with video');
  const [reel] = videoReels;
  const violations = await watchPolicy(page);
  const video = page.waitForRequest((r) => r.url().endsWith(reel.data.video!));
  await page.goto(`/reels/${reel.id}/`);
  await video;
  const card = await page.locator('meta[property="og:image"]').getAttribute('content');
  const res = await page.request.get(new URL(card!).pathname);
  expect(res.headers()['content-type']).toBe('image/png');
  expect(violations).toEqual([]);
});
