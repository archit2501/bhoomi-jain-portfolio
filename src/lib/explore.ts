/**
 * The Explore mosaic (task 4.1.2), as Instagram lays it out: three columns, in blocks of two
 * rows where one tall tile (a reel) sits beside four regular ones, the tall tile alternating
 * right and left from block to block. What's left over when reels or regular tiles run out goes
 * in plain rows. O(n) for n tiles.
 */

export type ExploreTile<T> = {
  item: T;
  /** Spans two rows, in the given column. */
  tall?: { column: 1 | 3 };
};

const PER_BLOCK = 4;

export function exploreLayout<T>(tall: readonly T[], regular: readonly T[]): ExploreTile<T>[] {
  const tiles: ExploreTile<T>[] = [];
  const blocks = Math.min(tall.length, Math.floor(regular.length / PER_BLOCK));
  for (let b = 0; b < blocks; b++) {
    // The tall tile first: the grid places it, and the four regular ones fill in around it.
    tiles.push({ item: tall[b], tall: { column: b % 2 === 0 ? 3 : 1 } });
    for (const item of regular.slice(b * PER_BLOCK, (b + 1) * PER_BLOCK)) tiles.push({ item });
  }
  for (const item of regular.slice(blocks * PER_BLOCK)) tiles.push({ item });
  for (const item of tall.slice(blocks)) tiles.push({ item });
  return tiles;
}

/** Two lists merged evenly, each in its own order: 4 posts and 2 stories make p s p p s p. */
export function interleave<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const nextA = i < a.length ? (i + 0.5) / a.length : Infinity;
    const nextB = j < b.length ? (j + 0.5) / b.length : Infinity;
    out.push(nextA <= nextB ? a[i++] : b[j++]);
  }
  return out;
}
