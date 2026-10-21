import { describe, expect, it } from 'vitest';
import { classify, dragTransform } from './gestures';

const at = (x: number, y: number, t: number) => ({ x, y, t });
const card = { width: 300, left: 100 };

describe('classify', () => {
  it('splits taps at the left third of the card', () => {
    expect(classify(at(150, 400, 0), at(150, 400, 80), card)).toBe('tap-prev');
    expect(classify(at(199, 400, 0), at(199, 400, 80), card)).toBe('tap-prev');
    expect(classify(at(201, 400, 0), at(201, 400, 80), card)).toBe('tap-next');
    expect(classify(at(390, 400, 0), at(390, 400, 80), card)).toBe('tap-next');
  });

  it('treats a press of 200 ms or more as a hold, not a tap', () => {
    expect(classify(at(300, 400, 0), at(300, 400, 199), card)).toBe('tap-next');
    expect(classify(at(300, 400, 0), at(300, 400, 200), card)).toBe('hold-end');
  });

  it('recognises swipes down, left and right past 50px', () => {
    expect(classify(at(300, 300, 0), at(310, 420, 150), card)).toBe('swipe-down');
    expect(classify(at(300, 300, 0), at(200, 310, 150), card)).toBe('swipe-next-group');
    expect(classify(at(200, 300, 0), at(300, 290, 150), card)).toBe('swipe-prev-group');
    expect(classify(at(300, 300, 0), at(340, 330, 80), card)).toBe('tap-next');
  });

  it('ignores upward swipes as taps', () => {
    expect(classify(at(300, 400, 0), at(300, 300, 80), card)).toBe('tap-next');
  });

  it("leaves touches at the screen's left edge to iOS's back-swipe", () => {
    expect(classify(at(10, 400, 0), at(200, 400, 150), { ...card, isTouch: true })).toBe('ignore');
    expect(classify(at(10, 400, 0), at(10, 400, 80), { width: 300, isTouch: false })).toBe(
      'tap-prev',
    );
  });
});

describe('dragTransform', () => {
  it('follows the finger downward and shrinks a little, never upward', () => {
    expect(dragTransform(-40)).toEqual({ translateY: 0, scale: 1 });
    expect(dragTransform(200)).toEqual({ translateY: 200, scale: 0.9 });
    expect(dragTransform(1000).scale).toBe(0.85);
  });
});
