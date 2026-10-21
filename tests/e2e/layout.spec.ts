import { expect, test, type Page } from '@playwright/test';
import { posts, row } from './fixtures';

// No page may scroll sideways at any common width (WCAG 1.4.10 reflow, and it looks broken).
const WIDTHS = [320, 390, 768, 1024, 1280, 1440, 1920];
const PAGES = ['/', '/reels/', `/p/${posts[0].id}/`, `/stories/${row[0].id}/`, '/404.html'];

async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    // Elements past the right edge that no scrolling or clipping ancestor contains.
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
      }
      return false;
    };
    const wider = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 0.5 && !clipped(el))
      .slice(0, 3)
      .map((el) => {
        const name = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
        return `${name} (right ${Math.round(el.getBoundingClientRect().right)})`;
      });
    return { extra: doc.scrollWidth - doc.clientWidth, wider };
  });
}

test.describe('no horizontal overflow', () => {
  // Layout depends on the viewport, not the device, so one project covers it.
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'one engine');

  for (const path of PAGES) {
    test(path, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const { extra, wider } = await overflow(page);
        expect(extra, `${path} at ${width}px overflows; widest: ${wider.join(', ')}`).toBe(0);
      }
    });
  }
});
