/** Pure helpers behind the post pop-up, carousel and double-tap like. */

/** The post before or after `current` in grid order; undefined at either end (no wrap, as on Instagram). */
export function neighbor(
  order: readonly string[],
  current: string,
  step: 1 | -1,
): string | undefined {
  const index = order.indexOf(current);
  if (index < 0) return undefined;
  return order[index + step];
}

/** "/p/revenue-100k/" → "revenue-100k"; anything else → null. */
export function postSlugFromPath(pathname: string): string | null {
  const match = /^\/p\/([a-z0-9-]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}

/** Which slide a scroll-snap track is showing, clamped to the slides that exist. */
export function slideIndex(scrollLeft: number, slideWidth: number, count: number): number {
  if (count <= 0 || slideWidth <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)));
}

/** Instagram's double-tap: a second tap within 300ms of the first. */
export const DOUBLE_TAP_MS = 300;

export function isDoubleTap(
  lastTapAt: number | undefined,
  now: number,
  windowMs = DOUBLE_TAP_MS,
): boolean {
  return lastTapAt !== undefined && now - lastTapAt >= 0 && now - lastTapAt <= windowMs;
}
