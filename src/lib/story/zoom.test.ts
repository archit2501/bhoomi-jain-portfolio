import { describe, expect, it } from 'vitest';
import { asCard, asRing, isOnScreen } from './zoom';

const card = { left: 400, top: 16, width: 488, height: 868 };

describe('asRing', () => {
  it('centres the card on the ring and scales it to the ring width', () => {
    const ring = { left: 100, top: 300, width: 87, height: 87 };
    const { transform } = asRing(card, ring);
    // Card centre (644, 450) moves to ring centre (143.5, 343.5).
    expect(transform).toBe('translate(-500.5px, -106.5px) scale(0.1783)');
  });

  it('clips the card to a circle as wide as the card, which the scale shrinks to the ring', () => {
    const ring = { left: 0, top: 0, width: 64, height: 64 };
    expect(asRing(card, ring).clipPath).toBe('circle(244px at 50% 50%)');
  });

  it('does not move a card that is already where the ring is', () => {
    expect(asRing(card, card).transform).toBe('translate(0px, 0px) scale(1)');
  });
});

describe('asCard', () => {
  it('uncovers every corner and keeps any transform it is given', () => {
    const frame = asCard({ left: 0, top: 0, width: 300, height: 400 }, 'translateY(40px)');
    expect(frame).toEqual({ transform: 'translateY(40px)', clipPath: 'circle(251px at 50% 50%)' });
  });

  it('defaults to no transform', () => {
    expect(asCard(card).transform).toBe('none');
  });
});

describe('isOnScreen', () => {
  const viewport = { width: 1280, height: 900 };

  it('accepts a ring inside the viewport, even partly', () => {
    expect(isOnScreen({ left: 100, top: 300, width: 87, height: 87 }, viewport)).toBe(true);
    expect(isOnScreen({ left: -40, top: -40, width: 87, height: 87 }, viewport)).toBe(true);
  });

  it('rejects a hidden ring and one scrolled out of view', () => {
    expect(isOnScreen({ left: 100, top: 300, width: 0, height: 0 }, viewport)).toBe(false);
    expect(isOnScreen({ left: 100, top: -200, width: 87, height: 87 }, viewport)).toBe(false);
    expect(isOnScreen({ left: 100, top: 900, width: 87, height: 87 }, viewport)).toBe(false);
    expect(isOnScreen({ left: -87, top: 300, width: 87, height: 87 }, viewport)).toBe(false);
    expect(isOnScreen({ left: 1280, top: 300, width: 87, height: 87 }, viewport)).toBe(false);
  });
});
