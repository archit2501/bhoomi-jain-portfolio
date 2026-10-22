import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BASE, posts, reels, row } from './fixtures';
import { stubTurnstile } from './live';

// Launch QA (task 5.2.1): every route answers cleanly on every device, every dialog passes axe,
// and focus never hides behind the fixed bars (WCAG 2.2, 2.4.11).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function serious(page: Page, selector: string) {
  const { violations } = await new AxeBuilder({ page }).include(selector).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help}`);
}

/** Every page in the sitemap, and the ones kept out of it. */
const sitemap = [
  ...readFileSync('dist/client/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g),
].map(([, url]) => new URL(url).pathname);
const ROUTES = [...new Set([...sitemap, '/saved/', '/offline/', '/direct/thread/'])];

test('every route answers and logs no errors', async ({ page }) => {
  test.setTimeout(180_000);
  await stubTurnstile(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|net::ERR|Failed to load resource/.test(m.text())) {
      errors.push(`${page.url()}: ${m.text()}`);
    }
  });
  expect(ROUTES.length).toBeGreaterThan(30);
  for (const path of ROUTES) {
    const res = await page.goto(path);
    expect([path, res?.status()]).toEqual([path, 200]);
    await expect(page.locator('main')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test.describe('dialogs on desktop', () => {
  test.use({ viewport: { width: 1280, height: 860 } });
  test.skip(({ isMobile }) => isMobile, 'the desktop shell');

  test('Create, More, the post pop-up and the story viewer pass axe', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav.side-nav').getByRole('link', { name: 'Create' }).click();
    await expect(page.locator('#create-sheet')).toBeVisible();
    // Measured once it has finished fading in.
    await expect(page.locator('#create-sheet')).toHaveCSS('opacity', '1');
    expect(await serious(page, '#create-sheet')).toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator('nav.side-nav').getByRole('button', { name: 'More' }).click();
    await expect(page.locator('#more-menu')).toBeVisible();
    // Measured once it has finished fading in.
    await expect(page.locator('#more-menu')).toHaveCSS('opacity', '1');
    expect(await serious(page, '#more-menu')).toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator(`.profile-tabs a[data-post="${posts[0].id}"]`).click();
    const modal = page.locator('#post-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('opacity', '1');
    expect(await serious(page, '#post-modal')).toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator(`a.highlight[data-story="${row[0].id}"]`).click();
    const viewer = page.locator('#story-viewer');
    await expect(viewer).not.toHaveClass(/zooming/);
    await viewer.getByRole('button', { name: 'Pause' }).click();
    expect(await serious(page, '#story-viewer')).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the comments sheet passes axe', async ({ page }) => {
    await page.goto(`/p/${posts[0].id}/`);
    await page.locator('.open-comments').first().click();
    const sheet = page.locator('.comments-sheet[open]');
    await expect(sheet).toBeVisible();
    expect(await serious(page, '.comments-sheet[open]')).toEqual([]);
  });

  for (const path of ['/feed/', `/p/${posts[0].id}/`, '/direct/hello/']) {
    test(`${path}: focus never hides behind the top bar or the tab bar`, async ({ page }) => {
      await page.goto(path);
      const hidden: string[] = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        // Focus scrolls the control clear of the bars; under load that scroll can lag the key,
        // so judge only once the page has stopped moving (the same position two frames running).
        await page.waitForFunction(
          () =>
            new Promise<boolean>((done) => {
              const y = scrollY;
              requestAnimationFrame(() => requestAnimationFrame(() => done(scrollY === y)));
            }),
        );
        // 2.4.11: a focused control must not be entirely hidden. What's drawn at its centre,
        // and at its corners, must be the control itself, not the top bar or the tab bar.
        const covered = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return null;
          const points = [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + 2, r.top + 2],
            [r.right - 2, r.bottom - 2],
          ].filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
          const shows = points.some(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && (el.contains(hit) || hit.contains(el));
          });
          return shows
            ? null
            : (el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName);
        });
        if (covered) hidden.push(covered);
      }
      expect(hidden).toEqual([]);
    });
  }
});

test('the reels feed and a story page answer at their own addresses', async ({ request }) => {
  for (const path of [`/reels/${reels.at(-1)!.id}/`, `/stories/${row.at(-1)!.id}/`]) {
    expect((await request.get(`${BASE}${path}`)).status()).toBe(200);
  }
});
