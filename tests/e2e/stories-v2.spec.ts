import { expect, test, type Page } from '@playwright/test';
import type { Sticker } from '../../src/lib/content-schema';
import { linkDomain } from '../../src/lib/story/stickers';
import { frameText, highlightName, highlights, row } from './fixtures';

// Stories v2 (task 2.2.3): the ring zoom, the two-face cube, stickers, a button for every gesture
// and next-only preloading. Content-driven: the highlights and stickers come from src/content.
const [first, second] = row;
const intro = highlights.find((h) => !h.data.inRow);

const viewer = (page: Page) => page.locator('#story-viewer');
// During a cube turn a frozen copy of the outgoing card (.face-out) sits beside the live one.
const live = (page: Page) => viewer(page).locator('.card:not(.face-out)');
const activeFrame = (page: Page) => live(page).locator('.frame.active');
const groupLabel = (page: Page) => live(page).locator('.group-label');

interface Recorded {
  target: string;
  keyframes: Record<string, string | number>[];
  duration: number;
}

/** Records every Web Animations call, so each animation's keyframes and timing can be checked. */
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    Object.assign(window, { __animations: log });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      log.push({
        target: typeof this.className === 'string' ? this.className : '',
        keyframes,
        duration: typeof options === 'number' ? options : options?.duration,
      });
      return animate.call(this, keyframes, options);
    };
  });
}

const recorded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __animations: Recorded[] }).__animations);

/** The card's animations of a given length (280 ms zoom, 350 ms cube). */
async function cardAnimations(page: Page, duration: number) {
  return (await recorded(page)).filter(
    (a) => a.duration === duration && a.target.split(' ').includes('card'),
  );
}

async function settled(page: Page) {
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page)).not.toHaveClass(/zooming/);
  await expect(viewer(page)).toHaveCSS('opacity', '1');
}

/** Reads `translate(Xpx, Ypx) scale(S)` back into numbers. */
function parseTransform(transform: string | number | undefined) {
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(String(transform));
  if (!match) throw new Error(`not a ring transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

type Box = { x: number; y: number; width: number; height: number };
const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The card, transformed as recorded, sits on the ring: same centre, same width. */
function expectOnRing(transform: string | number | undefined, card: Box, ring: Box) {
  const t = parseTransform(transform);
  expect(Math.abs(centre(card).x + t.x - centre(ring).x)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(centre(card).y + t.y - centre(ring).y)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(card.width * t.scale - ring.width)).toBeLessThanOrEqual(1.5);
}

test.describe('ring zoom and cube', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(async ({ page }) => recordAnimations(page));

  test('a highlight grows out of its ring in 280ms and shrinks back into it', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: highlightName(first) });
    const ring = (await link.locator('.ring').boundingBox())!;
    await link.click();
    await settled(page);
    const card = (await viewer(page).locator('.card-wrap').boundingBox())!;

    const [grow] = await cardAnimations(page, 280);
    expect(grow, 'the card grows out of the ring').toBeTruthy();
    expectOnRing(grow.keyframes[0].transform, card, ring);
    expect(grow.keyframes[0].clipPath).toMatch(/^circle\(/);
    expect(grow.keyframes.at(-1)?.transform).toBe('none');
    // At rest the card is itself again.
    const rest = (await live(page).boundingBox())!;
    expect(Math.round(rest.width)).toBe(Math.round(card.width));

    // Swipe down: the card leaves from where the drag left it and lands on the ring.
    const cx = card.x + card.width / 2;
    await page.mouse.move(cx, card.y + 200);
    await page.mouse.down();
    await page.mouse.move(cx, card.y + 380, { steps: 6 });
    await page.mouse.up();
    await expect(viewer(page)).toBeHidden();
    const shrink = (await cardAnimations(page, 280)).at(-1)!;
    expect(shrink).not.toBe(grow);
    expect(String(shrink.keyframes[0].transform)).toContain('translateY(');
    expectOnRing(shrink.keyframes.at(-1)?.transform, card, ring);
    await expect(page).toHaveURL(/\/$/);
  });

  test('moving between highlights turns a two-face cube with shading (350ms)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: highlightName(first) }).click();
    await settled(page);
    await viewer(page)
      .getByRole('button', { name: `Next highlight: ${second.data.label}` })
      .click();
    await expect(groupLabel(page)).toHaveText(second.data.label);

    const turn = await cardAnimations(page, 350);
    const outgoing = turn.find((a) => a.target.includes('face-out'));
    const incoming = turn.find((a) => !a.target.includes('face-out'));
    expect(outgoing?.keyframes.map((k) => k.transform)).toEqual([
      'rotateY(0deg)',
      'rotateY(-90deg)',
    ]);
    expect(incoming?.keyframes.map((k) => k.transform)).toEqual([
      'rotateY(90deg)',
      'rotateY(0deg)',
    ]);
    // Both faces turn about the same axis, half a card behind the screen.
    expect(outgoing?.keyframes[0].transformOrigin).toBe(incoming?.keyframes[0].transformOrigin);
    expect(String(incoming?.keyframes[0].transformOrigin)).toMatch(/^50% 50% -\d+(\.\d+)?px$/);
    // Each face darkens as it turns away.
    const shades = (await recorded(page)).filter((a) => a.target === 'shade');
    expect(shades.map((a) => a.keyframes.map((k) => k.opacity))).toEqual([
      [0, 0.6],
      [0.6, 0],
    ]);
    // The frozen outgoing face is gone once the turn ends.
    await expect(viewer(page).locator('.face-out')).toHaveCount(0);
    await expect(activeFrame(page)).toContainText(frameText(second, 0));

    // Back the other way: the cube turns the other direction.
    await viewer(page)
      .getByRole('button', { name: `Previous highlight: ${first.data.label}` })
      .click();
    await expect(groupLabel(page)).toHaveText(first.data.label);
    const back = (await cardAnimations(page, 350)).filter((a) => !a.target.includes('face-out'));
    expect(back.at(-1)?.keyframes[0].transform).toBe('rotateY(-90deg)');
  });

  test('with reduced motion there is no zoom: the viewer fades in and out', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: highlightName(first) }).click();
    await settled(page);
    await viewer(page).getByRole('button', { name: 'Close' }).click();
    await expect(viewer(page)).toBeHidden();
    expect(await cardAnimations(page, 280)).toEqual([]);
  });

  test('her ring turns grey once the intro has been watched, and stays grey', async ({ page }) => {
    test.skip(!intro, 'no intro story in the content');
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const avatar = page.locator('a.avatar-link .avatar').first();
    await expect(avatar).not.toHaveClass(/\bseen\b/);
    await page.locator('a.avatar-link').click();
    await settled(page);
    // Still unseen while it plays: the ring changes as the story lands back in it.
    await expect(avatar).not.toHaveClass(/\bseen\b/);
    await viewer(page).getByRole('button', { name: 'Close' }).click();
    await expect(viewer(page)).toBeHidden();
    await expect(avatar).toHaveClass(/\bseen\b/);
    await page.reload();
    await expect(page.locator('a.avatar-link .avatar').first()).toHaveClass(/\bseen\b/);
  });
});

/** The first frame in the content with a sticker of this type. */
function findSticker<T extends Sticker['type']>(type: T) {
  for (const h of highlights) {
    for (const [i, frame] of h.data.frames.entries()) {
      const sticker = (frame.stickers ?? []).find((s) => s.type === type);
      if (sticker) return { h, i, sticker: sticker as Extract<Sticker, { type: T }> };
    }
  }
  return undefined;
}

/** Opens a highlight (the intro from the avatar) and steps to one of its frames. */
async function openFrame(page: Page, h: (typeof highlights)[number], i: number) {
  await page.goto('/');
  if (h.data.inRow) await page.getByRole('link', { name: highlightName(h) }).click();
  else await page.locator('a.avatar-link').click();
  await settled(page);
  for (let n = 0; n < i; n++) await page.keyboard.press('ArrowRight');
  await expect(activeFrame(page)).toContainText(frameText(h, i));
}

test.describe('stickers', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a link sticker opens its page in a new tab, labelled with the domain', async ({ page }) => {
    const found = findSticker('link');
    test.skip(!found, 'no link sticker in the content');
    const { h, i, sticker } = found!;
    await openFrame(page, h, i);
    const link = activeFrame(page).getByRole('link', {
      name: sticker.label ?? linkDomain(sticker.href),
    });
    await expect(link).toHaveAttribute('href', sticker.href);
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('a mention opens its post, and pressing it never skips the story', async ({ page }) => {
    const found = findSticker('mention');
    test.skip(!found, 'no mention sticker in the content');
    const { h, i, sticker } = found!;
    await openFrame(page, h, i);
    const mention = activeFrame(page).getByRole('link', { name: `@${sticker.name}` });
    await expect(mention).toHaveAttribute('href', sticker.href);

    // A press on the sticker is not a tap on the story.
    await mention.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
    await mention.click();
    await page.waitForTimeout(300);
    await expect(activeFrame(page)).toContainText(frameText(h, i));

    await mention.evaluate((a) => a.replaceWith(a.cloneNode(true)));
    await activeFrame(page)
      .getByRole('link', { name: `@${sticker.name}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`${sticker.href}$`));
  });

  test('location and code stickers show their text', async ({ page }) => {
    for (const type of ['location', 'code'] as const) {
      const found = findSticker(type);
      if (!found) continue;
      const { h, i, sticker } = found;
      await openFrame(page, h, i);
      await expect(activeFrame(page).locator(`[data-sticker="${type}"]`)).toHaveText(
        sticker.type === 'code' ? sticker.code : sticker.type === 'location' ? sticker.name : '',
      );
    }
  });

  test('a focused sticker holds the story still; leaving it resumes', async ({
    page,
    browserName,
  }) => {
    // Safari's Tab skips links and buttons unless Option is held, as a keyboard user would.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const found = findSticker('link') ?? findSticker('mention');
    test.skip(!found, 'no focusable sticker in the content');
    const { h, i } = found!;
    await openFrame(page, h, i);
    const pause = live(page).locator('.pause');
    await pause.focus();
    await expect(pause).toHaveAttribute('aria-label', 'Pause');
    await page.keyboard.press(`Shift+${tab}`);
    await expect(activeFrame(page).locator('.sticker:focus')).toHaveCount(1);
    await expect(pause).toHaveAttribute('aria-label', 'Play');
    await page.keyboard.press(tab);
    await expect(pause).toBeFocused();
    await expect(pause).toHaveAttribute('aria-label', 'Pause');
  });
});

test.describe('a button for every gesture on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Tabs until the named button has focus (Option+Tab in Safari, which skips buttons on Tab). */
  async function tabTo(page: Page, name: string | RegExp) {
    const tab = page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';
    const button = viewer(page).getByRole('button', { name });
    for (let n = 0; n < 8 && !(await button.evaluate((b) => b === document.activeElement)); n++) {
      await page.keyboard.press(tab);
    }
    await expect(button).toBeFocused();
    return button;
  }

  test('stories, highlights, pausing and closing all work from the keyboard', async ({ page }) => {
    await openFrame(page, first, 0);
    // Taps: the story buttons appear over the card when focused.
    const nextStory = await tabTo(page, 'Next story');
    expect((await nextStory.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(activeFrame(page)).toContainText(frameText(first, 1));

    // Sideways swipes: the next-highlight button.
    const nextHighlight = await tabTo(page, `Next highlight: ${second.data.label}`);
    expect((await nextHighlight.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(groupLabel(page)).toHaveText(second.data.label);

    // Hold: the pause button. Swipe down: the close button.
    await expect(live(page).locator('.pause')).toBeVisible();
    await expect(viewer(page).getByRole('button', { name: 'Close' })).toBeVisible();
  });
});

test.describe('preloading', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('only the story on screen and the next one fetch their photos', async ({ page }) => {
    test.skip(first.data.frames.length < 3, 'needs a highlight with three stories');
    const fetched = new Set<string>();
    page.on('request', (request) => {
      const match = /preload-test=([a-z0-9-]+)\.(\d+)/.exec(request.url());
      if (match) fetched.add(`${match[1]}.${match[2]}`);
    });
    await page.goto('/');
    // Give every story a photo. Template content is inert, so nothing fetches yet.
    await page.evaluate(() => {
      for (const template of document.querySelectorAll<HTMLTemplateElement>(
        'template[data-story-group]',
      )) {
        template.content.querySelectorAll('.frame').forEach((frame, i) => {
          const url = `/og/default.png?preload-test=${template.dataset.storyGroup}.${i}`;
          frame.insertAdjacentHTML(
            'beforeend',
            `<picture><img class="media-img" src="${url}" alt="" loading="lazy"></picture>`,
          );
        });
      }
    });
    await page.waitForTimeout(300);
    expect([...fetched]).toEqual([]);

    await page.getByRole('link', { name: highlightName(first) }).click();
    await settled(page);
    await expect.poll(() => [...fetched].sort()).toEqual([`${first.id}.0`, `${first.id}.1`]);

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => fetched.has(`${first.id}.2`)).toBe(true);

    // At a highlight's last story, the next highlight's first photo is the one fetched.
    const last = first.data.frames.length - 1;
    for (let n = 1; n < last; n++) await page.keyboard.press('ArrowRight');
    await expect(activeFrame(page)).toContainText(frameText(first, last));
    await expect.poll(() => fetched.has(`${second.id}.0`)).toBe(true);
    expect([...fetched].filter((f) => f.startsWith(`${second.id}.`))).toEqual([`${second.id}.0`]);
  });
});
