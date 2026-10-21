/**
 * Likes. Until the likes API (task 3.1.2) counts them for everyone, a like lives in this browser
 * only: "Liked by you" shows at once and survives reloads. Counts, once they exist, show from 10
 * likes up (decision Q5), worded as Instagram words them.
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

/**
 * The line under the buttons. `count` is everyone's likes, the visitor's included; it is
 * undefined until the API exists. Null means show nothing.
 */
export function likesLine(liked: boolean, count?: number): string | null {
  if (count === undefined || count < MIN_SHOWN_COUNT) return liked ? 'Liked by you' : null;
  if (!liked) return `${number.format(count)} likes`;
  return `Liked by you and ${number.format(count - 1)} others`;
}
