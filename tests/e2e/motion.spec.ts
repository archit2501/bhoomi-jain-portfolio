import { expect, test, type Page } from '@playwright/test';
import { posts, row } from './fixtures';

/**
 * Clicks a trigger and reads the dialog's computed style in the same task, so the first frame of
 * its entry animation is caught: a dialog that pops in instantly is already at its end state.
 */
async function firstFrame(page: Page, trigger: string, dialog: string) {
  return page.evaluate(
    ([t, d]) => {
      (document.querySelector(t) as HTMLElement).click();
      const style = getComputedStyle(document.querySelector(d) as Element);
      return { opacity: Number(style.opacity), transform: style.transform };
    },
    [trigger, dialog] as const,
  );
}

const settled = (page: Page, dialog: string) =>
  page.locator(dialog).evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
    const style = getComputedStyle(el);
    return { opacity: Number(style.opacity), transform: style.transform };
  });

test.describe('nothing pops in instantly', () => {
  test.skip(({ isMobile }) => isMobile, 'viewport is set per test');

  test('the links sheet slides up on a phone and settles in place', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const start = await firstFrame(page, 'header.profile .more-links', '#contact-sheet');
    expect(start.transform).not.toBe('none');
    const end = await settled(page, '#contact-sheet');
    expect(end.transform).toBe('none');
  });

  test('the links sheet opens like a modal on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    const start = await firstFrame(page, 'header.profile .more-links', '#contact-sheet');
    expect(start.opacity).toBeLessThan(1);
    expect((await settled(page, '#contact-sheet')).opacity).toBe(1);
  });

  test('a story grows out of its ring, solid from the first frame', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    // Click and read in the same task, so the zoom's first frame is caught on any machine.
    const start = await page.evaluate((trigger) => {
      (document.querySelector(trigger) as HTMLElement).click();
      return {
        viewer: Number(getComputedStyle(document.querySelector('#story-viewer')!).opacity),
        card: getComputedStyle(document.querySelector('#story-viewer .card')!).transform,
      };
    }, `a.highlight[data-story="${row[0].id}"]`);
    expect(start.viewer).toBe(1);
    expect(start.card).not.toBe('none');
    await expect(page.locator('#story-viewer')).not.toHaveClass(/zooming/);
    expect(await page.locator('#story-viewer .card').evaluate((el) => el.style.transform)).toBe('');
  });

  test('with reduced motion, stories fade in instead', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    const start = await firstFrame(page, `a.highlight[data-story="${row[0].id}"]`, '#story-viewer');
    expect(start.opacity).toBeLessThan(1);
    expect((await settled(page, '#story-viewer')).opacity).toBe(1);
  });

  test('a grid tile grows into the pop-up through a view transition', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    const supported = await page.evaluate(() => 'startViewTransition' in document);
    test.skip(!supported, 'no view transitions in this engine');
    const started = await page.evaluate((slug) => {
      let calls = 0;
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = ((cb: () => void) => {
        calls++;
        return original(cb);
      }) as typeof document.startViewTransition;
      (document.querySelector(`#panel-posts a[data-post="${slug}"]`) as HTMLElement).click();
      return calls;
    }, posts[0].id);
    expect(started).toBe(1);
    await expect(page.locator('#post-modal')).toBeVisible();
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test.skip(({ isMobile }) => isMobile, 'viewport is set per test');

  test('sheets fade without moving, and the pop-up opens without a transition', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const start = await firstFrame(page, 'header.profile .more-links', '#contact-sheet');
    expect(start.transform).toBe('none');

    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/');
    const calls = await page.evaluate((slug) => {
      let n = 0;
      if ('startViewTransition' in document) {
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = ((cb: () => void) => {
          n++;
          return original(cb);
        }) as typeof document.startViewTransition;
      }
      (document.querySelector(`#panel-posts a[data-post="${slug}"]`) as HTMLElement).click();
      return n;
    }, posts[0].id);
    expect(calls).toBe(0);
    await expect(page.locator('#post-modal')).toBeVisible();
  });

  test('no press scaling', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('header.profile .btn').first();
    await button.hover();
    await page.mouse.down();
    await expect(button).toHaveCSS('scale', 'none');
    await page.mouse.up();
  });
});

test('controls shrink a little while pressed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse press');
  await page.goto('/');
  const button = page.locator('header.profile .btn').first();
  await button.hover();
  await page.mouse.down();
  await expect(button).toHaveCSS('scale', '0.98');
  await page.mouse.up();
});
