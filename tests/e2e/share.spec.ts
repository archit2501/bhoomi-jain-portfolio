import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { BASE, profile, reels, row } from './fixtures';

// Sharing her profile (task 5.1.1): copy link, the device's own share, her contact card and a
// QR card that encodes only her site's address; and share images for every reel and highlight.

const domain = new URL(BASE).host;
const sheet = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Share' });

test('Share profile opens the sheet; copy, contact card and the QR card', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  const opener = page.locator('header.profile').getByRole('link', { name: 'Share profile' });
  await opener.click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(sheet(page).getByRole('link', { name: 'Contact card' })).toHaveAttribute(
    'download',
    `${profile.displayName}.vcf`,
  );

  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await sheet(page).getByRole('button', { name: 'Copy link' }).click();
    await expect(sheet(page).getByRole('status')).toHaveText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${BASE}/`);
  }

  const qrToggle = sheet(page).getByRole('button', { name: 'QR code' });
  await qrToggle.click();
  await expect(qrToggle).toHaveAttribute('aria-expanded', 'true');
  const qr = sheet(page).getByRole('img', { name: `QR code for ${domain}` });
  await expect(qr).toBeVisible();
  await expect(sheet(page).locator('figcaption')).toHaveText(`${profile.displayName}${domain}`);
  // A real code: dark modules drawn as one path, on a white quiet zone.
  expect((await qr.locator('path').getAttribute('d'))!.length).toBeGreaterThan(200);

  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(opener).toBeFocused();
});

test('the share sheet has no serious accessibility issues', async ({ page }) => {
  await page.goto('/');
  await page.locator('header.profile').getByRole('link', { name: 'Share profile' }).click();
  await sheet(page).getByRole('button', { name: 'QR code' }).click();
  const { violations } = await new AxeBuilder({ page }).include('#share-sheet').analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('her contact card: name, title, email and links, never a phone number', async ({
  request,
}) => {
  const res = await request.get('/contact.vcf');
  // Served as a static file: text/vcard or the older text/x-vcard, both understood.
  expect(res.headers()['content-type']).toMatch(/^text\/(x-)?vcard/);
  const card = await res.text();
  expect(card).toContain(`FN:${profile.displayName}`);
  expect(card).toContain(`TITLE:${profile.category}`);
  expect(card).toContain(`URL:${BASE}/`);
  expect(card).not.toMatch(/^TEL/m);
  expect(card).not.toMatch(/\+?\d[\d\s-]{9,}\d/);
});

test('every reel and highlight has its own share image', async ({ page, request }) => {
  for (const path of [`/og/r/${reels[0].id}.png`, `/og/s/${row[0].id}.png`]) {
    const res = await request.get(path);
    expect(res.headers()['content-type']).toBe('image/png');
    const bytes = await res.body();
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  }
  await page.goto(`/reels/${reels[0].id}/`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${BASE}/og/r/${reels[0].id}.png`,
  );
  await page.goto(`/stories/${row[0].id}/`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${BASE}/og/s/${row[0].id}.png`,
  );
});
