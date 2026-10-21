/**
 * Likes. The database (task 3.1.2) holds them; this browser keeps the visitor's own like too, so
 * it shows at once and still shows if the likes API is switched off. Counts come only from the
 * API, and only from 10 likes up (decision Q5), worded as Instagram words them.
 */

export const LIKE_KEY_PREFIX = 'bhoomi:liked:';
/** A short tick on like, as Android's Instagram gives (iOS has no web vibration). */
export const LIKE_HAPTIC_MS = 12;
/** Below this, a count would read as "nobody likes this"; show only the visitor's own like. */
export const MIN_SHOWN_COUNT = 10;

export const likeKey = (id: string): string => `${LIKE_KEY_PREFIX}${id}`;

export type LikeStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Whether this visitor liked the post. Blocked or missing storage reads as not liked. */
export function isLiked(store: LikeStore | undefined, id: string): boolean {
  try {
    return store?.getItem(likeKey(id)) === '1';
  } catch {
    return false;
  }
}

/** Remembers a like (or its removal). False when storage is blocked: the like still shows. */
export function saveLiked(store: LikeStore | undefined, id: string, liked: boolean): boolean {
  if (!store) return false;
  try {
    if (liked) store.setItem(likeKey(id), '1');
    else store.removeItem(likeKey(id));
    return true;
  } catch {
    return false;
  }
}

const number = new Intl.NumberFormat('en');

export interface LikesParts {
  before: string;
  /** The number to show, rolled by the odometer; null when there is no number. */
  count: number | null;
  after: string;
}

/**
 * The line under the buttons, in parts so the number can roll. `count` is everyone's likes,
 * the visitor's included, as the database last said; undefined when it hasn't answered.
 * Null means show nothing.
 */
export function likesParts(liked: boolean, count?: number): LikesParts | null {
  if (count === undefined || count <= 0) {
    return liked ? { before: 'Liked by you', count: null, after: '' } : null;
  }
  if (count < MIN_SHOWN_COUNT) {
    if (!liked) return { before: 'Liked by visitors', count: null, after: '' };
    return {
      before: count > 1 ? 'Liked by you and others' : 'Liked by you',
      count: null,
      after: '',
    };
  }
  if (!liked) return { before: '', count, after: ' likes' };
  return { before: 'Liked by you and ', count: count - 1, after: ' others' };
}

/** The same line as plain text. */
export function likesLine(liked: boolean, count?: number): string | null {
  const parts = likesParts(liked, count);
  if (!parts) return null;
  return `${parts.before}${parts.count === null ? '' : formatCount(parts.count)}${parts.after}`;
}

export function formatCount(n: number): string {
  return number.format(n);
}

/**
 * Which characters of a count change between two values, for the odometer: the new string,
 * aligned right, with each position marked as rolling up, down or staying.
 */
export function odometer(from: number, to: number): { char: string; roll: 'up' | 'down' | null }[] {
  const a = formatCount(from);
  const b = formatCount(to);
  const width = Math.max(a.length, b.length);
  const pa = a.padStart(width, ' ');
  const pb = b.padStart(width, ' ');
  const direction = to > from ? 'up' : 'down';
  const out: { char: string; roll: 'up' | 'down' | null }[] = [];
  for (let i = 0; i < width; i++) {
    if (pb[i] === ' ') continue;
    out.push({ char: pb[i], roll: pa[i] === pb[i] ? null : direction });
  }
  return out;
}
