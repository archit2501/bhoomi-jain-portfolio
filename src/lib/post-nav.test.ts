import { describe, expect, it } from 'vitest';
import { isDoubleTap, neighbor, postSlugFromPath, slideIndex } from './post-nav';

describe('neighbor', () => {
  const order = ['a', 'b', 'c'];

  it('steps forward and back through the grid order', () => {
    expect(neighbor(order, 'b', 1)).toBe('c');
    expect(neighbor(order, 'b', -1)).toBe('a');
  });

  it('stops at the ends instead of wrapping', () => {
    expect(neighbor(order, 'a', -1)).toBeUndefined();
    expect(neighbor(order, 'c', 1)).toBeUndefined();
  });

  it('returns nothing for an unknown post', () => {
    expect(neighbor(order, 'z', 1)).toBeUndefined();
  });
});

describe('postSlugFromPath', () => {
  it('reads the slug from a post URL, with or without the trailing slash', () => {
    expect(postSlugFromPath('/p/smartblog-ai/')).toBe('smartblog-ai');
    expect(postSlugFromPath('/p/smartblog-ai')).toBe('smartblog-ai');
  });

  it('ignores every other page', () => {
    expect(postSlugFromPath('/')).toBeNull();
    expect(postSlugFromPath('/reels/')).toBeNull();
    expect(postSlugFromPath('/p/')).toBeNull();
    expect(postSlugFromPath('/p/a/b/')).toBeNull();
  });
});

describe('slideIndex', () => {
  it('rounds to the nearest slide', () => {
    expect(slideIndex(0, 400, 3)).toBe(0);
    expect(slideIndex(190, 400, 3)).toBe(0);
    expect(slideIndex(210, 400, 3)).toBe(1);
    expect(slideIndex(800, 400, 3)).toBe(2);
  });

  it('clamps overscroll and handles empty tracks', () => {
    expect(slideIndex(-50, 400, 3)).toBe(0);
    expect(slideIndex(5000, 400, 3)).toBe(2);
    expect(slideIndex(100, 0, 3)).toBe(0);
    expect(slideIndex(100, 400, 0)).toBe(0);
  });
});

describe('isDoubleTap', () => {
  it('counts a second tap within 300ms', () => {
    expect(isDoubleTap(1000, 1250)).toBe(true);
    expect(isDoubleTap(1000, 1300)).toBe(true);
  });

  it('ignores slow taps, first taps and clock skew', () => {
    expect(isDoubleTap(1000, 1301)).toBe(false);
    expect(isDoubleTap(undefined, 1000)).toBe(false);
    expect(isDoubleTap(1000, 900)).toBe(false);
  });
});
