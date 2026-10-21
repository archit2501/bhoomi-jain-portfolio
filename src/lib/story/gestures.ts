/** Turns one pointer press into a story gesture. Pure, so every threshold is unit-tested. */

export interface PointerSample {
  x: number;
  y: number;
  /** Milliseconds, from the event's timeStamp. */
  t: number;
}

export type Gesture =
  | 'tap-prev'
  | 'tap-next'
  | 'hold-end'
  | 'swipe-down'
  | 'swipe-next-group'
  | 'swipe-prev-group'
  | 'ignore';

export interface GestureOptions {
  /** Width of the story card, for the left-third tap zone. */
  width: number;
  /** Left edge of the story card in the same coordinates as the samples. */
  left?: number;
  isTouch?: boolean;
  holdMs?: number;
  swipePx?: number;
  /** Touches this close to the screen's left edge belong to iOS's back-swipe. */
  edgePx?: number;
}

export const HOLD_MS = 200;
export const SWIPE_PX = 50;
export const EDGE_PX = 20;

export function classify(down: PointerSample, up: PointerSample, options: GestureOptions): Gesture {
  const {
    width,
    left = 0,
    isTouch = false,
    holdMs = HOLD_MS,
    swipePx = SWIPE_PX,
    edgePx = EDGE_PX,
  } = options;
  if (isTouch && down.x < edgePx) return 'ignore';

  const dx = up.x - down.x;
  const dy = up.y - down.y;
  if (dy > swipePx && Math.abs(dy) > Math.abs(dx)) return 'swipe-down';
  if (Math.abs(dx) > swipePx && Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 'swipe-next-group' : 'swipe-prev-group';
  }
  if (up.t - down.t >= holdMs) return 'hold-end';
  // Instagram's split: the left third goes back, the rest goes forward.
  return down.x - left < width / 3 ? 'tap-prev' : 'tap-next';
}

/** How far the card follows a downward drag: it moves with the finger and shrinks slightly. */
export function dragTransform(dy: number): { translateY: number; scale: number } {
  const y = Math.max(0, dy);
  return { translateY: y, scale: Math.max(0.85, 1 - y / 2000) };
}
