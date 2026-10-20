import { expect, test, type Locator } from '@playwright/test';
import { NAME, profile, statTexts } from './fixtures';

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
    const contact = await box(header.getByRole('link', { name: 'Contact' }));
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

  test('Contact opens the contact sheet', async ({ page }) => {
    await page.goto('/');
    await page.locator('header.profile').getByRole('link', { name: 'Contact' }).click();
    await expect(page.getByRole('dialog', { name: `Contact ${NAME}` })).toBeVisible();
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
