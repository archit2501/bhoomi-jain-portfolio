/**
 * Geometry for the story zoom: the card grows out of the ring that was tapped and, when the story
 * is dismissed, shrinks back into it (FLIP: the card is laid out at full size, then transformed to
 * look like the ring and animated back to none). Pure, so it is unit-tested.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A type alias, not an interface, so it passes as a Web Animations keyframe. */
export type ZoomFrame = {
  transform: string;
  clipPath: string;
};

const centre = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/** The card drawn as the ring: centred on it, scaled to its width and clipped to a circle. */
export function asRing(card: Box, ring: Box): ZoomFrame {
  const from = centre(card);
  const to = centre(ring);
  const scale = ring.width / card.width;
  return {
    transform: `translate(${round(to.x - from.x)}px, ${round(to.y - from.y)}px) scale(${round(scale, 4)})`,
    // In the card's own (unscaled) coordinates: half its width becomes the ring's radius.
    clipPath: `circle(${round(card.width / 2)}px at 50% 50%)`,
  };
}

/** The card as itself: a circle just large enough to uncover every corner. */
export function asCard(card: Box, transform = 'none'): ZoomFrame {
  return {
    transform,
    clipPath: `circle(${round(Math.hypot(card.width, card.height) / 2 + 1)}px at 50% 50%)`,
  };
}

/** Whether a ring is on screen, so there is somewhere to zoom from or back into. */
export function isOnScreen(box: Box, viewport: { width: number; height: number }): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.left + box.width > 0 &&
    box.top + box.height > 0 &&
    box.left < viewport.width &&
    box.top < viewport.height
  );
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
