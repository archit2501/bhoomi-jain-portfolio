import { expect, test, type Page } from '@playwright/test';
import { highlights, row } from './fixtures';

// Stories as printed pages (task 6.4.2): every text story on its own field with the post
// slides' running head and layouts, the viewer's bar in ink on light fields, the previews beside
// the card printed like the highlight they open, and no sticker ever covering a story's words.

const viewer = (page: Page) => page.locator('#story-viewer');
const live = (page: Page) => viewer(page).locator('.card:not(.face-out)');
const pad = (n: number) => String(n).padStart(2, '0');

/** Opens a highlight's viewer (the intro from her avatar) and pauses it on its first story. */
async function open(page: Page, id: string) {
  await page.goto('/');
  await page.locator(`[data-story="${id}"]`).first().click();
  await expect(viewer(page)).toBeVisible();
  await viewer(page).getByRole('button', { name: 'Pause' }).click();
  await expect(viewer(page).getByRole('button', { name: 'Play' })).toBeVisible();
  // A story that ran out before the pause landed has moved on: step back to the first.
  const active = live(page).locator('.frame.active');
  while (!(await active.getAttribute('aria-label'))?.startsWith('1 of')) {
    await step(page, 'prev');
  }
}

/** Steps a story with the viewer's own buttons (hidden on phones until focused). */
async function step(page: Page, side: 'prev' | 'next') {
  await viewer(page)
    .locator(`.frame-${side}`)
    .evaluate((b: HTMLElement) => b.click());
}

const next = (page: Page) => step(page, 'next');

test('every text story is printed on a field, under its highlight and page', async ({ page }) => {
  await page.goto('/');
  const printed = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLTemplateElement>('template[data-story-group]')].map((t) => ({
      id: t.dataset.storyGroup,
      frames: [...t.content.querySelectorAll<HTMLElement>('.frame')].map((f) => ({
        field: f.dataset.field ?? null,
        head: f.querySelector('.run-head')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      })),
    })),
  );
  expect(printed).toHaveLength(highlights.length);
  for (const { id, frames } of printed) {
    const h = highlights.find((x) => x.id === id)!;
    frames.forEach((frame, i) => {
      if (h.data.frames[i].type !== 'text') return;
      expect(frame.field).toBeTruthy();
      if (i > 0) expect(frame.field).not.toBe(frames[i - 1].field);
      expect(frame.head).toBe(`${h.data.label} ${pad(i + 1)} / ${pad(frames.length)}`);
    });
  }
});

test('on a light field the bar turns to ink; on a dark one it stays white', async ({ page }) => {
  // Each highlight opens on its own field; find one that opens light and one that opens dark.
  const grounds = await (async () => {
    await page.goto('/');
    return page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLTemplateElement>('template[data-story-group]')].map(
          (t) => [
            t.dataset.storyGroup,
            t.content.querySelector<HTMLElement>('.frame')?.dataset.ground,
          ],
        ),
      ),
    );
  })();
  const light = row.find((h) => grounds[h.id] === 'light');
  const dark = row.find((h) => grounds[h.id] === 'dark');
  test.skip(!light || !dark, 'needs a highlight opening on each');

  await open(page, light!.id);
  await expect(live(page)).toHaveAttribute('data-ground', 'light');
  await expect(live(page).locator('.username')).toHaveCSS('color', 'rgb(12, 16, 20)');
  await expect(live(page).locator('.scrim')).toBeHidden();

  await open(page, dark!.id);
  await expect(live(page)).toHaveAttribute('data-ground', 'dark');
  await expect(live(page).locator('.username')).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('no sticker covers a story’s words, on any screen', async ({ page }) => {
  test.setTimeout(120_000);
  const overlaps: string[] = [];
  for (const h of highlights) {
    if (!h.data.frames.some((f) => f.stickers?.length)) continue;
    await open(page, h.id);
    for (const [i, frame] of h.data.frames.entries()) {
      if (i > 0) await next(page);
      if (!frame.stickers?.length) continue;
      const active = live(page).locator('.frame.active');
      await expect(active).toHaveAttribute('aria-label', `${i + 1} of ${h.data.frames.length}`);
      const hits = await active.evaluate((el) => {
        const boxes = (selector: string) =>
          [...el.querySelectorAll(selector)].map((n) => n.getBoundingClientRect());
        const words = boxes('.cover .c > :not(.foot), .cover .foot > *');
        return boxes('.sticker').flatMap((s, k) =>
          words
            .filter(
              (w) => s.left < w.right && w.left < s.right && s.top < w.bottom && w.top < s.bottom,
            )
            .map(() => k),
        );
      });
      if (hits.length) overlaps.push(`${h.id} story ${i + 1}`);
    }
  }
  expect(overlaps).toEqual([]);
});

test.describe('beside the card on desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the previews show on wide screens');
  test.use({ viewport: { width: 1280, height: 860 } });

  test('the next highlight’s preview is printed on its first field, with its glyph', async ({
    page,
  }) => {
    const [, second] = row;
    test.skip(!second || second.data.cover.type !== 'icon', 'needs a glyph cover second');
    await open(page, row[0].id);
    const field = await page
      .locator(`template[data-story-group="${second.id}"]`)
      .getAttribute('data-field');
    const peek = viewer(page).locator('.peek-next');
    await expect(peek).toHaveAttribute('data-field', field!);
    await expect(peek.locator('.peek-cover .peek-glyph svg')).toHaveCount(1);
    // The glyph is only for the preview: the story itself never shows it.
    await expect(live(page).locator('.frames .peek-glyph')).toHaveCount(0);
  });
});

test('a highlight’s page prints its stories as the viewer does', async ({ page }) => {
  const h = row.find((x) => x.data.frames.every((f) => f.type === 'text')) ?? row[0];
  const texts = h.data.frames.filter((f) => f.type === 'text').length;
  await page.goto(`/stories/${h.id}/`);
  await expect(page.locator('.frame.printed[data-field] .cover')).toHaveCount(texts);
  const first = h.data.frames[0];
  if (first.type === 'text') {
    await expect(page.locator('.frame').first()).toContainText(first.body);
  }
});
