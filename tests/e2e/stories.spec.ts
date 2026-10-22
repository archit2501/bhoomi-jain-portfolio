import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { frameMs, frameText, pageTitle, row } from './fixtures';

// The first three highlights in the row and the last one drive these tests. The first needs at
// least three stories (taps go forward twice), the second at least two.
const [first, second, third] = row;
const last = row[row.length - 1];
const n = first.data.frames.length;

const viewer = (page: Page) => page.locator('#story-viewer');
// During a cube turn a frozen copy of the outgoing card (.face-out) sits beside the live one.
const live = (page: Page) => viewer(page).locator('.card:not(.face-out)');
const activeFrame = (page: Page) => live(page).locator('.frame.active');
const groupLabel = (page: Page) => live(page).locator('.group-label');

async function openHighlight(page: Page, label: string) {
  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(`^Highlight: ${label},`) }).click();
  await expect(viewer(page)).toBeVisible();
  // The card grows out of the ring and the viewer fades in; measuring (or running axe) mid-way
  // reads a half-sized card and half-transparent colours.
  await expect(viewer(page)).not.toHaveClass(/zooming/);
  await expect(viewer(page)).toHaveCSS('opacity', '1');
}

async function cardBox(page: Page) {
  const box = await live(page).boundingBox();
  if (!box) throw new Error('story card is not visible');
  return box;
}

test('the content gives these tests enough stories', () => {
  expect(row.length).toBeGreaterThanOrEqual(3);
  expect(n).toBeGreaterThanOrEqual(3);
  expect(second.data.frames.length).toBeGreaterThanOrEqual(2);
});

test.describe('desktop viewer', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a highlight opens its stories at their own URL, with one bar per story', async ({
    page,
  }) => {
    await openHighlight(page, first.data.label);
    await expect(viewer(page)).toHaveAccessibleName(`${first.data.label} stories`);
    await expect(page).toHaveURL(new RegExp(`/stories/${first.id}/$`));
    await expect(page).toHaveTitle(pageTitle(`${first.data.label} highlights`));
    await expect(live(page).locator('.progress .bar')).toHaveCount(n);
    await expect(activeFrame(page)).toContainText(frameText(first, 0));
    await expect(viewer(page).getByRole('button', { name: 'Pause' })).toBeFocused();
    const box = await cardBox(page);
    expect(Math.round(box.height)).toBe(900 - 32);
    expect(Math.abs(box.width / box.height - 9 / 16)).toBeLessThan(0.01);
    // Centred even on the first highlight, where there is no previous preview.
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThanOrEqual(1);
  });

  test('advances on its own after the frame time', async ({ page }) => {
    await openHighlight(page, first.data.label);
    await expect(activeFrame(page)).toContainText(frameText(first, 1), {
      timeout: frameMs(first, 0) + 3000,
    });
    await expect(viewer(page).locator('.fill').first()).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
  });

  test('taps: left third goes back, the rest goes forward', async ({ page }) => {
    await openHighlight(page, first.data.label);
    const box = await cardBox(page);
    const y = box.y + box.height / 2;
    await page.mouse.click(box.x + box.width * 0.8, y);
    await expect(activeFrame(page)).toContainText(frameText(first, 1));
    await page.mouse.click(box.x + box.width * 0.8, y);
    await expect(activeFrame(page)).toContainText(frameText(first, 2));
    await page.mouse.click(box.x + box.width * 0.2, y);
    await expect(activeFrame(page)).toContainText(frameText(first, 1));
    await expect(viewer(page).locator('.story-status')).toHaveText(
      `${first.data.label}, story 2 of ${n}`,
    );
  });

  test('holding pauses and hides the chrome; releasing resumes', async ({ page }) => {
    await openHighlight(page, first.data.label);
    const box = await cardBox(page);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await expect(viewer(page)).toHaveClass(/chrome-hidden/);
    await expect(live(page).locator('.pause')).toHaveAttribute('aria-label', 'Play');
    await page.mouse.up();
    await expect(viewer(page)).not.toHaveClass(/chrome-hidden/);
    await expect(live(page).locator('.pause')).toHaveAttribute('aria-label', 'Pause');
    // A hold is not a tap: still on the first story.
    await expect(activeFrame(page)).toContainText(frameText(first, 0));
  });

  test('keyboard: arrows move, Space pauses, Esc closes and returns focus', async ({ page }) => {
    await openHighlight(page, first.data.label);
    await page.keyboard.press('ArrowRight');
    await expect(activeFrame(page)).toContainText(frameText(first, 1));
    await page.keyboard.press('ArrowLeft');
    await expect(activeFrame(page)).toContainText(frameText(first, 0));
    await page.keyboard.press('Space');
    await expect(live(page).locator('.pause')).toHaveAttribute('aria-label', 'Play');
    const fill = viewer(page).locator('.fill').first();
    const before = await fill.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(600);
    expect(await fill.evaluate((el) => getComputedStyle(el).transform)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('link', { name: new RegExp(`^Highlight: ${first.data.label},`) }),
    ).toBeFocused();
  });

  test('the last story of a highlight rolls into the next highlight', async ({ page }) => {
    await openHighlight(page, first.data.label);
    for (let i = 0; i < n - 1; i++) await page.keyboard.press('ArrowRight');
    await expect(activeFrame(page)).toContainText(frameText(first, n - 1));
    await page.keyboard.press('ArrowRight');
    await expect(groupLabel(page)).toHaveText(second.data.label);
    await expect(page).toHaveURL(new RegExp(`/stories/${second.id}/$`));
    await expect(live(page).locator('.progress .bar')).toHaveCount(second.data.frames.length);
  });

  test('moving past the very last story closes the viewer', async ({ page }) => {
    await openHighlight(page, last.data.label);
    for (let i = 0; i < last.data.frames.length; i++) await page.keyboard.press('ArrowRight');
    await expect(viewer(page)).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('swipes: sideways between highlights, down to close', async ({ page }) => {
    await openHighlight(page, first.data.label);
    const box = await cardBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx + 100, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 100, cy, { steps: 5 });
    await page.mouse.up();
    await expect(groupLabel(page)).toHaveText(second.data.label);
    await expect(live(page)).toHaveAttribute('data-transition', 'cube');

    // The turn is over when its outgoing copy is gone (a fixed wait lost the race under load).
    await expect(viewer(page).locator('.card.face-out')).toHaveCount(0);
    await page.mouse.move(cx - 100, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 5 });
    await page.mouse.up();
    await expect(groupLabel(page)).toHaveText(first.data.label);

    await expect(viewer(page).locator('.card.face-out')).toHaveCount(0);
    await page.mouse.move(cx, cy - 100);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 150, { steps: 5 });
    await page.mouse.up();
    await expect(viewer(page)).toBeHidden();
  });

  test('with reduced motion, highlights crossfade instead of turning', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHighlight(page, first.data.label);
    await viewer(page)
      .getByRole('button', { name: `Next highlight: ${second.data.label}` })
      .click();
    await expect(groupLabel(page)).toHaveText(second.data.label);
    await expect(live(page)).toHaveAttribute('data-transition', 'fade');
  });

  test('neighbour previews and chevrons', async ({ page }) => {
    await openHighlight(page, second.data.label);
    await expect(
      viewer(page).getByRole('button', { name: `Previous highlight: ${first.data.label}` }),
    ).toBeVisible();
    await expect(
      viewer(page).getByRole('button', { name: `Next highlight: ${third.data.label}` }),
    ).toBeVisible();
    await viewer(page).getByRole('button', { name: 'Next story' }).click();
    await expect(activeFrame(page)).toContainText(frameText(second, 1));
    await viewer(page)
      .getByRole('button', { name: `Previous highlight: ${first.data.label}` })
      .click();
    await expect(groupLabel(page)).toHaveText(first.data.label);
  });

  test('browser Back closes the viewer and Forward reopens it', async ({ page }) => {
    await openHighlight(page, third.data.label);
    await page.goBack();
    await expect(viewer(page)).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(viewer(page)).toBeVisible();
    await expect(groupLabel(page)).toHaveText(third.data.label);
  });

  test('the open viewer has no serious accessibility issues', async ({ page }) => {
    await openHighlight(page, first.data.label);
    const { violations } = await new AxeBuilder({ page }).include('#story-viewer').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('phone viewer', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fills the screen; the chevrons and previews stay out of sight until focused', async ({
    page,
  }) => {
    await openHighlight(page, first.data.label);
    const box = await cardBox(page);
    expect(Math.round(box.width)).toBe(390);
    expect(Math.round(box.height)).toBe(844);
    for (const button of [
      viewer(page).getByRole('button', { name: 'Next story' }),
      viewer(page).locator('.peek-next'),
    ]) {
      const size = await button.boundingBox();
      expect(size?.width ?? 0).toBeLessThanOrEqual(1);
    }
  });

  test("touches at the left edge are left to iOS's back-swipe", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'needs a touch screen');
    await openHighlight(page, first.data.label);
    await page.touchscreen.tap(300, 420);
    await expect(activeFrame(page)).toContainText(frameText(first, 1));
    await page.touchscreen.tap(8, 420);
    await page.waitForTimeout(300);
    await expect(activeFrame(page)).toContainText(frameText(first, 1));
    await page.touchscreen.tap(60, 420);
    await expect(activeFrame(page)).toContainText(frameText(first, 0));
  });
});
