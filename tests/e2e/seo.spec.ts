import { expect, test } from '@playwright/test';
import { FIRST_NAME, highlights, NAME, pageTitle, posts, profile, reels, row } from './fixtures';

const PAGES = [
  '/',
  '/reels/',
  `/p/${posts[0].id}/`,
  `/stories/${row[0].id}/`,
  `/reels/${reels[0].id}/`,
  '/feed/',
  '/explore/',
  '/direct/',
  '/notifications/',
  '/insights/',
];

for (const path of PAGES) {
  test(`${path}: canonical link, share card and the not-affiliated footer`, async ({ page }) => {
    await page.goto(path);
    const title = await page.title();
    expect(title.toLowerCase()).not.toContain('instagram');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${path}$`),
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/og\/.+\.png$/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('footer#contact')).toContainText(
      'Not affiliated with Instagram or Meta.',
    );
  });
}

test('the profile describes her for search engines with resume facts', async ({ page }) => {
  await page.goto('/');
  const raw = await page.locator('script[type="application/ld+json"]').textContent();
  const person = JSON.parse(raw ?? '{}');
  expect(person).toMatchObject({
    '@type': 'Person',
    name: NAME,
    sameAs: [profile.links.linkedin],
    ...(profile.jobTitle && { jobTitle: profile.jobTitle }),
    ...(profile.organization && { worksFor: { name: profile.organization.name } }),
    ...(profile.education && { alumniOf: { name: profile.education } }),
  });
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og\/default\.png$/,
  );
});

test('sitemap lists every page and robots.txt points to it', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(locs).toContain('/');
  for (const path of [
    '/reels/',
    '/feed/',
    '/explore/',
    '/direct/',
    '/notifications/',
    '/insights/',
  ]) {
    expect(locs).toContain(path);
  }
  expect(locs.filter((p) => p.startsWith('/p/'))).toHaveLength(posts.length);
  expect(locs.filter((p) => p.startsWith('/stories/'))).toHaveLength(highlights.length);
  expect(locs.filter((p) => /^\/reels\/.+/.test(p))).toHaveLength(reels.length);
  for (const loc of locs.slice(0, 4)) {
    expect((await request.get(loc)).status()).toBe(200);
  }
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
});

test('the default share card is a 1200x630 PNG', async ({ request }) => {
  const res = await request.get('/og/default.png');
  expect(res.headers()['content-type']).toBe('image/png');
  const bytes = await res.body();
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
});

test('an unknown address shows the 404 page in the site style', async ({ page }) => {
  const res = await page.goto('/no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle(pageTitle('Page not found'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    "Sorry, this page isn't available.",
  );
  await page.getByRole('link', { name: `Go back to ${FIRST_NAME}'s profile.` }).click();
  await expect(page).toHaveURL(/\/$/);
});
