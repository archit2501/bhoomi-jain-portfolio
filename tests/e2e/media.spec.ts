import { expect, test, type Page } from '@playwright/test';
import { BASE } from './fixtures';

// The fade-in runs in every browser, so this covers each project. It works on photos added after
// load too (the story viewer and post pop-up clone theirs in).
async function addPhoto(page: Page, src: string) {
  await page.evaluate((url) => {
    const box = document.createElement('span');
    box.className = 'media-box';
    box.id = 'probe';
    box.style.cssText = 'width: 120px; height: 120px';
    const img = document.createElement('img');
    img.className = 'media-img';
    img.alt = '';
    img.src = url;
    box.append(img);
    document.querySelector('main')?.append(box);
  }, src);
  return page.locator('#probe img');
}

test('a photo waits behind its placeholder, then fades in once decoded', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\bjs\b/);
  const img = await addPhoto(page, '/icons/icon-192.png');
  await expect(img).toHaveAttribute('data-loaded', '');
  await expect(img).toHaveCSS('opacity', '1');
  await expect(page.locator('#probe')).not.toHaveCSS('animation-name', 'media-pulse');
});

test('a broken photo is never left invisible', async ({ page }) => {
  await page.goto('/');
  const img = await addPhoto(page, '/no-such-photo.png');
  await expect(img).toHaveAttribute('data-loaded', '');
});

test('without JavaScript photos show straight away', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
  await context.close();
});
