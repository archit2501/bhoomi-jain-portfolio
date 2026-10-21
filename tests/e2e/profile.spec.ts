import { expect, test, type Locator } from '@playwright/test';
import { NAME, profile, statTexts } from './fixtures';

/** Who she is, proof, how to reach her: what a recruiter needs before scrolling. */
const ABOVE_THE_FOLD = (header: Locator) => [
  header.getByRole('heading', { level: 1 }),
  header.locator('.category'),
  header.locator('.stats'),
  header.locator('.bio'),
  header.getByRole('link', { name: 'Message' }),
  header.getByRole('link', { name: 'LinkedIn', exact: true }),
];

const near = (actual: number | undefined, expected: number, tolerance = 2) =>
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(tolerance);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element is not visible');
  return b;
}

test.describe('desktop header (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('matches Instagram sizes', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header.profile');
    const avatar = header.locator('.avatar-wide');
    near((await box(avatar)).width, 168);
    // The photo's own width; its bounding box also includes the gap between photo and ring.
    await expect(avatar.locator('.initials, img')).toHaveCSS('width', '150px');
    await expect(header.locator('.username')).toHaveCSS('font-size', '20px');
    await expect(header.locator('.avatar-link')).toHaveCSS('text-decoration-line', 'none');
    for (const button of await header.locator('.btn').all()) {
      near((await box(button)).height, 32);
      await expect(button).toHaveCSS('border-radius', '8px');
    }
    // Username row: username, then the buttons on the same line.
    const username = await box(header.locator('.username'));
    const contact = await box(header.getByRole('link', { name: 'Message' }));
    expect(contact.x).toBeGreaterThan(username.x + username.width);
    near(contact.y + contact.height / 2, username.y + username.height / 2, 3);
  });

  test('shows her real numbers, name, bio and link', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header.profile');
    await expect(header.getByRole('heading', { level: 1 })).toHaveText(NAME);
    await expect(header.locator('.stats li')).toHaveText(statTexts);
    for (const line of profile.bio.split('\n')) {
      await expect(header.locator('.bio')).toContainText(line);
    }
    await expect(header.locator('.bio-link')).toHaveAttribute('href', profile.links.linkedin);
  });

  test('has no Follow, login or open-in-app prompts anywhere', async ({ page }) => {
    await page.goto('/');
    const text = (await page.locator('body').innerText()).toLowerCase();
    // "follow-up" in a caption is fine; a Follow button, or followers/following counts, are not.
    expect(text).not.toMatch(/\b(follow|followers|following)\b(?!-)/);
    for (const phrase of ['log in', 'login', 'sign up', 'open app', 'open in app']) {
      expect(text).not.toContain(phrase);
    }
  });

  test('Message goes to her inbox; "and N more" opens every link', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header.profile');
    await expect(header.getByRole('link', { name: 'Message' })).toHaveAttribute('href', '/direct/');
    await header.getByRole('link', { name: /^and \d+ more$/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Links' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute(
      'href',
      profile.links.linkedin,
    );
  });
});

test.describe('phone header (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('app layout: avatar left, name and stats right, buttons full width', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header.profile');
    const avatar = await box(header.locator('.avatar-narrow'));
    await expect(header.locator('.avatar-narrow').locator('.initials, img')).toHaveCSS(
      'width',
      '86px',
    );
    near(avatar.width, 96);
    await expect(header.locator('.avatar-wide')).toBeHidden();
    await expect(header.locator('.username')).toBeHidden();
    const name = await box(header.getByRole('heading', { level: 1 }));
    const stats = await box(header.locator('.stats'));
    expect(name.x).toBeGreaterThan(avatar.x + avatar.width);
    expect(stats.x).toBeGreaterThan(avatar.x + avatar.width);
    expect(stats.y).toBeGreaterThan(name.y);
    const actions = await box(header.locator('.actions'));
    const bio = await box(header.locator('.about'));
    expect(actions.y).toBeGreaterThan(bio.y + bio.height - 1);
    near(actions.width, 390 - 32);
    for (const button of await header.locator('.btn').all()) {
      near((await box(button)).height, 32);
    }
  });
});

for (const [width, height] of [
  [390, 844],
  [360, 640],
  [1280, 720],
] as const) {
  test(`${width}×${height}: who, what, proof and contact all show before scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    for (const item of ABOVE_THE_FOLD(page.locator('header.profile'))) {
      const b = await box(item);
      // Above the phone's 49px tab bar.
      expect(b.y + b.height).toBeLessThan(height - (width < 768 ? 49 : 0));
    }
  });
}

test('a Note shows above her photo only when she has one', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.avatar-cell .note')).toHaveCount(profile.note ? 1 : 0);
});
