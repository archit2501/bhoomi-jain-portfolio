import { expect, test, type Page } from '@playwright/test';
import { BASE, NAME, profile } from './fixtures';

const visible = (page: Page) => ({
  appBar: page.locator('.app-bar'),
  bottomTabs: page.locator('nav.bottom-tabs'),
  sideNav: page.locator('nav.side-nav'),
});

test('phone: app bar and bottom tabs, no side nav', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const { appBar, bottomTabs, sideNav } = visible(page);
  await expect(appBar).toBeVisible();
  await expect(bottomTabs).toBeVisible();
  await expect(sideNav).toBeHidden();
  await expect(bottomTabs.getByRole('link')).toHaveText(['Home', 'Reels', 'Messages']);
});

test('tablet and small laptop: 72px icon rail with screen-reader labels', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const { appBar, bottomTabs, sideNav } = visible(page);
  await expect(sideNav).toBeVisible();
  await expect(appBar).toBeHidden();
  await expect(bottomTabs).toBeHidden();
  expect((await sideNav.boundingBox())?.width).toBe(72);
  for (const name of ['Home', 'Reels', 'Messages']) {
    await expect(sideNav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(sideNav.locator('.label').first()).toHaveCSS('position', 'absolute');
});

test('wide desktop: 244px sidebar with visible labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sideNav = page.locator('nav.side-nav');
  expect((await sideNav.boundingBox())?.width).toBe(244);
  await expect(sideNav.locator('.label').first()).toHaveCSS('position', 'static');
  await expect(sideNav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('every nav item does something real', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const nav = page.locator('nav.side-nav');

  await nav.getByRole('link', { name: 'Reels', exact: true }).click();
  await expect(page).toHaveURL(/\/reels\/$/);
  await expect(page.getByRole('tab', { name: 'Reels' })).toHaveAttribute('aria-selected', 'true');
  await expect(nav.getByRole('link', { name: 'Reels', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const messages = nav.getByRole('link', { name: 'Messages' });
  await messages.click();
  const sheet = page.getByRole('dialog', { name: `Contact ${NAME}` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute(
    'href',
    profile.links.linkedin,
  );
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(messages).toBeFocused();
});

test('contact sheet closes from its button and from the backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('nav.bottom-tabs').getByRole('link', { name: 'Messages' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();

  await page.locator('nav.bottom-tabs').getByRole('link', { name: 'Messages' }).click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(195, 40);
  await expect(sheet).toBeHidden();
});

test('without JavaScript, Messages jumps to the contact links', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.locator('nav.bottom-tabs').getByRole('link', { name: 'Messages' }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator('#contact').getByRole('link').first()).toBeVisible();
  await context.close();
});

test('skip link takes keyboard users straight to the main content', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // WebKit's Tab skips links unless full keyboard access is on; Option+Tab is the Safari way.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
