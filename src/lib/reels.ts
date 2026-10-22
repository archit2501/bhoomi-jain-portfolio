/** Pure helpers behind the reels feed (src/components/reels/ReelsFeed.astro). */

/**
 * The feed for /reels/<start>/: that reel first, then the ones after it, then the ones before,
 * so every reel is one scroll away and the page needs no JavaScript to open on the right reel.
 */
export function feedOrder<T extends { id: string }>(reels: readonly T[], start: string): T[] {
  const i = reels.findIndex((r) => r.id === start);
  if (i < 0) return [...reels];
  return [...reels.slice(i), ...reels.slice(0, i)];
}

/** "/reels/latency/" → "latency"; the Reels tab (/reels/) and anything else → null. */
export function reelSlugFromPath(pathname: string): string | null {
  return /^\/reels\/([a-z0-9-]+)\/?$/.exec(pathname)?.[1] ?? null;
}

/** Instagram plays a reel once most of it is on screen. */
export const PLAY_VISIBLE = 0.6;

/** The reels whose poster may load: the one on screen and the next one. */
export function postersToLoad(count: number, current: number): number[] {
  if (current < 0 || current >= count) return [];
  return current + 1 < count ? [current, current + 1] : [current];
}

/**
 * A reel poster for the grid: "/reels/x.webp" has "/reels/x-sm.webp", 270 px wide, for the small
 * tiles (a phone's 3-column grid is ~136 px wide), as a srcset with the full one.
 */
export const SMALL_POSTER_WIDTH = 270;

export function posterSources(poster: string, width: number): { srcset: string; sizes: string } {
  return {
    srcset: `${poster.replace(/\.webp$/, '-sm.webp')} ${SMALL_POSTER_WIDTH}w, ${poster} ${width}w`,
    sizes: '(min-width: 768px) 296px, 33vw',
  };
}
