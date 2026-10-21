import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BASE, NAME, profile } from './fixtures';

const SIDE_NAV = [
  'Home',
  'Search',
  'Explore',
  'Reels',
  'Messages',
  'Notifications',
  'Create',
  'Profile',
];
const BOTTOM_TABS = ['Home', 'Reels', 'Messages', 'Search', 'Profile'];

const bars = (page: Page) => ({
  appBar: page.locator('.app-bar'),
  bottomTabs: page.locator('nav.bottom-tabs'),
  sideNav: page.locator('nav.side-nav'),
});

/** Waits for open/close animations, so axe doesn't measure a half-faded drawer. */
const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

const serious = async (page: Page, selector: string) => {
  await settled(page);
  const { violations } = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help}`);
};

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('top bar with Create and Notifications, the 2026 tab bar, no side nav', async ({ page }) => {
    await page.goto('/');
    const { appBar, bottomTabs, sideNav } = bars(page);
    await expect(appBar).toBeVisible();
    await expect(sideNav).toBeHidden();
    for (const [i, name] of BOTTOM_TABS.entries()) {
      await expect(bottomTabs.getByRole('link').nth(i)).toHaveAccessibleName(name);
    }
    await expect(appBar.getByRole('link', { name: 'Create' })).toBeVisible();
    await expect(appBar.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'href',
      '/notifications/',
    );
    // Her profile is the landing page, so Profile is the current tab there.
    await expect(bottomTabs.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('every tab goes to its own page', async ({ page }) => {
    for (const [name, path] of [
      ['Home', '/feed/'],
      ['Reels', '/reels/'],
      ['Messages', '/direct/'],
      ['Search', '/explore/'],
      ['Profile', '/'],
    ] as const) {
      await page.goto('/notifications/');
      await page.locator('nav.bottom-tabs').getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('nav.bottom-tabs').getByRole('link', { name })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test("Explore's search bar opens search full screen, and Close returns to it", async ({
    page,
  }) => {
    await page.goto('/explore/');
    const bar = page.getByRole('button', { name: 'Search' });
    await bar.click();
    const panel = page.getByRole('dialog', { name: 'Search' });
    await expect(panel).toBeVisible();
    // WebKit on Linux reports 390.00001px; compare whole pixels.
    expect(Math.round((await panel.boundingBox())?.width ?? 0)).toBe(390);
    await page.getByRole('searchbox', { name: /Search projects/ }).fill('fastapi');
    await expect(panel.locator('.result-title').first()).toHaveText('FastAPI');
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
    await expect(bar).toBeFocused();
  });

  test('Create opens the start-a-conversation sheet', async ({ page }) => {
    await page.goto('/');
    await page.locator('.app-bar').getByRole('link', { name: 'Create' }).click();
    const sheet = page.getByRole('dialog', { name: 'Start a conversation' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link').first()).toHaveAttribute('href', /^\/direct\/[a-z-]+\/$/);
    expect(await serious(page, '#create-sheet')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

test('tablet and small laptop: 72px icon rail with screen-reader labels', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const { appBar, bottomTabs, sideNav } = bars(page);
  await expect(sideNav).toBeVisible();
  await expect(appBar).toBeHidden();
  await expect(bottomTabs).toBeHidden();
  expect((await sideNav.boundingBox())?.width).toBe(72);
  for (const name of SIDE_NAV) {
    await expect(sideNav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(sideNav.locator('.label').first()).toHaveCSS('position', 'absolute');
});

test.describe('wide desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('244px sidebar with every item, labels, and More at the bottom', async ({ page }) => {
    await page.goto('/');
    const sideNav = page.locator('nav.side-nav');
    expect((await sideNav.boundingBox())?.width).toBe(244);
    await expect(sideNav.locator('ul .label')).toHaveText(SIDE_NAV);
    await expect(sideNav.locator('.label').first()).toHaveCSS('position', 'static');
    const profileLink = sideNav.getByRole('link', { name: 'Profile', exact: true });
    await expect(profileLink).toHaveAttribute('aria-current', 'page');
    const more = sideNav.getByRole('button', { name: 'More' });
    const last = await profileLink.boundingBox();
    expect((await more.boundingBox())!.y).toBeGreaterThan(last!.y + 100);
  });

  test('every page in the nav has its own title and share card', async ({ page }) => {
    for (const [name, path, title] of [
      ['Home', '/feed/', 'Home'],
      ['Explore', '/explore/', 'Explore'],
      ['Reels', '/reels/', 'Reels'],
      ['Messages', '/direct/', 'Messages'],
    ] as const) {
      await page.goto('/');
      await page.locator('nav.side-nav').getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page).toHaveTitle(`${title} · ${NAME}`);
    }
    for (const path of ['/feed/', '/explore/', '/direct/', '/notifications/', '/insights/']) {
      await page.goto(path);
      const og = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(og).toMatch(/\/og\/pages\/\w+\.png$/);
      expect((await page.request.get(og!)).status()).toBe(200);
    }
  });

  test('Search slides out, folds the sidebar, finds things, and closes on Esc', async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = page.locator('nav.side-nav').getByRole('link', { name: 'Search' });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Search' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('searchbox', { name: /Search projects/ })).toBeFocused();
    await expect(page.locator('nav.side-nav')).toHaveCSS('width', '72px');
    const box = await panel.boundingBox();
    expect([Math.round(box!.x), Math.round(box!.width)]).toEqual([72, 397]);

    await page.keyboard.type('mongodb');
    await expect(panel.locator('.result-title')).toContainText(['MongoDB', 'SmartBlog AI']);
    expect(await serious(page, '#panel-search')).toEqual([]);
    // Chromium's first Esc in a filled search box only clears it (WebKit closes at once), so
    // clear it first: then one Esc closes the drawer everywhere.
    await page.getByRole('searchbox', { name: /Search projects/ }).fill('');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('nav.side-nav')).toHaveCSS('width', '244px');
  });

  test('"/" opens search; typing in a box does not', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: /Search projects/ })).toBeFocused();
    await page.keyboard.type('/x');
    await expect(page.getByRole('searchbox', { name: /Search projects/ })).toHaveValue('/x');
  });

  test('Notifications slides out with her real career events', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav.side-nav').getByRole('link', { name: 'Notifications' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.event').first()).toBeVisible();
    expect(await serious(page, '#panel-notifications')).toEqual([]);
    await page.mouse.click(1200, 450);
    await expect(panel).toBeHidden();
  });

  test('More: Insights, appearance and the not-affiliated line; the theme sticks', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByRole('button', { name: 'More' }).click();
    const menu = page.getByRole('dialog', { name: 'More' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Insights' })).toHaveAttribute(
      'href',
      '/insights/',
    );
    await expect(menu).toContainText('Not affiliated with Instagram or Meta.');
    expect(await serious(page, '#more-menu')).toEqual([]);
    await menu.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(12, 16, 20)');
  });
});

test('the links sheet opens from the bio and closes from its button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .locator('header.profile')
    .getByRole('link', { name: /^and \d+ more$/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Links' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute(
    'href',
    profile.links.linkedin,
  );
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
});

test('without JavaScript, drawer links are real pages', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.locator('nav.side-nav').getByRole('link', { name: 'Notifications' }).click();
  await expect(page).toHaveURL(/\/notifications\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
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
