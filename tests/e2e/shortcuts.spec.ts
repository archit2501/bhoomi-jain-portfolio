import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { feedOrder as reelOrder } from '../../src/lib/reels';
import { feedOrder } from '../../src/lib/feed';
import { posts, reels, row } from './fixtures';
import { ownIp, stubTurnstile } from './live';

// The desktop keyboard layer (task 5.1.2), saving, and the ambient glow behind stories and reels.
test.use({ viewport: { width: 1280, height: 860 } });
test.skip(({ isMobile }) => isMobile, 'a keyboard layer for desktops');

test.beforeEach(async ({ page }, testInfo) => {
  await stubTurnstile(page);
  await ownIp(page, testInfo);
});

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });

test('"?" lists the shortcuts, as does More; the list is accessible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('?');
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('row')).toHaveCount(13);
  await expect(sheet(page).getByRole('row', { name: /G then E Go to Explore/ })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('#shortcuts-sheet').analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();

  await page.locator('nav.side-nav').getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(sheet(page)).toBeVisible();
});

test('the home feed: J and K move between posts, L likes, S saves', async ({ page }) => {
  const ordered = feedOrder(posts);
  await page.goto('/feed/');
  await page.keyboard.press('j');
  await expect(page.getByRole('link', { name: ordered[1].data.title, exact: true })).toBeFocused();
  await page.keyboard.press('j');
  await page.keyboard.press('k');
  await expect(page.getByRole('link', { name: ordered[1].data.title, exact: true })).toBeFocused();
  const card = page.locator('.feed-card', {
    has: page.getByRole('heading', { name: ordered[1].data.title }),
  });
  await page.keyboard.press('l');
  await expect(card.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(card.locator('button.save')).toHaveAttribute('aria-pressed', 'true');
});

test('reels: J moves on, S saves, Space pauses, M says when there is no sound', async ({
  page,
}) => {
  const order = reelOrder(reels, reels[0].id);
  await page.goto(`/reels/${reels[0].id}/`);
  await page.keyboard.press('j');
  await expect(page).toHaveURL(new RegExp(`/reels/${order[1].id}/$`));
  const reel = page.locator(`.reel-item[data-reel="${order[1].id}"]`);
  await page.keyboard.press('s');
  await expect(reel.locator('button.save')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(page.locator('[data-shortcut-status]')).toHaveText('This reel has no sound.');
  if (order[1].data.video) {
    const toggle = reel.locator('.reel-toggle');
    const before = await toggle.getAttribute('aria-label');
    await page.keyboard.press(' ');
    await expect(toggle).not.toHaveAttribute('aria-label', before!);
  }
});

test('stories and the post pop-up: J goes to the next one', async ({ page }) => {
  await page.goto('/');
  await page.locator(`a.highlight[data-story="${row[0].id}"]`).click();
  const viewer = page.locator('#story-viewer');
  await expect(viewer).not.toHaveClass(/zooming/);
  await viewer.getByRole('button', { name: 'Pause' }).click();
  await page.keyboard.press('j');
  await expect(viewer.locator('.story-status')).toHaveText(/story 2 of/);
  await page.keyboard.press('Escape');

  const grid = feedOrder(posts); // any two posts in the profile grid
  expect(grid.length).toBeGreaterThan(1);
  await page.locator('.profile-tabs a[data-post]').first().click();
  const modal = page.locator('#post-modal');
  await expect(modal).toBeVisible();
  const first = page.url();
  await page.keyboard.press('j');
  await expect.poll(() => page.url()).not.toBe(first);
});

test('G then a letter goes there', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('g');
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/\/explore\/$/);
  await page.waitForLoadState('load');
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/\/reels\//);
});

test('switched off, single keys do nothing, and it stays off', async ({ page }) => {
  await page.goto('/feed/');
  await page.keyboard.press('?');
  await sheet(page).getByRole('checkbox', { name: 'Single-key shortcuts' }).uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.keyboard.press('/');
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
  await page.keyboard.press('g');
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/\/feed\/$/);
  // Typing is never a shortcut.
  await page.keyboard.press('?');
  await expect(sheet(page)).toBeHidden();
});

test('typing in a field is never a shortcut', async ({ page }) => {
  await page.goto('/direct/hello/');
  const box = page.getByLabel('Message', { exact: true });
  await box.fill('');
  await box.pressSequentially('gjkls?');
  await expect(box).toHaveValue('gjkls?');
  await expect(page).toHaveURL(/\/direct\/hello\/$/);
});

test('saved posts and reels show on /saved/, newest first, and can be removed', async ({
  page,
}) => {
  await page.goto('/saved/');
  await expect(
    page.getByRole('heading', { name: 'Save what you want to see again' }),
  ).toBeVisible();

  await page.goto(`/p/${posts[0].id}/`);
  await page.locator('.post-view button.save').first().click();
  await expect(page.locator('.post-view button.save').first()).toHaveAttribute(
    'aria-label',
    'Remove from saved',
  );
  await page.goto(`/reels/${reels[0].id}/`);
  await page.locator(`.reel-item[data-reel="${reels[0].id}"] button.save`).click();

  await page.goto('/saved/');
  const tiles = page.locator('[data-saved-grid] > li:not([hidden]) a');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.first()).toHaveAttribute('href', `/reels/${reels[0].id}/`);
  await expect(tiles.last()).toHaveAttribute('href', `/p/${posts[0].id}/`);

  await page.goto(`/p/${posts[0].id}/`);
  await page.locator('.post-view button.save').first().click();
  await page.goto('/saved/');
  await expect(tiles).toHaveCount(1);
});

test('the ambient glow takes each reel’s colours, and each story’s', async ({ page }) => {
  const order = reelOrder(reels, reels[0].id);
  await page.goto(`/reels/${reels[0].id}/`);
  const glow = page.locator('.reels-feed [data-ambient-layers]');
  await expect(glow).toBeVisible();
  const shown = async () =>
    glow
      .locator('.layer.on')
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--ambient-a'));
  const first = await page
    .locator(`.reel-item[data-reel="${order[0].id}"]`)
    .getAttribute('data-ambient');
  await expect.poll(shown).toBe(first!.split(' ')[0]);
  await page.keyboard.press('j');
  const second = await page
    .locator(`.reel-item[data-reel="${order[1].id}"]`)
    .getAttribute('data-ambient');
  await expect.poll(shown).toBe(second!.split(' ')[0]);

  await page.goto('/');
  await page.locator(`a.highlight[data-story="${row[0].id}"]`).click();
  const viewer = page.locator('#story-viewer');
  await expect(viewer.locator('[data-ambient-layers]')).toBeVisible();
  await expect
    .poll(() =>
      viewer
        .locator('.layer.on')
        .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--ambient-a')),
    )
    .toMatch(/^#[0-9a-f]{6}$/);
});

test('no glow on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/reels/${reels[0].id}/`);
  await expect(page.locator('.reels-feed [data-ambient-layers]')).toBeHidden();
});
