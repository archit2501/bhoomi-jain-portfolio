import { describe, expect, it } from 'vitest';
import { feedOrder, postersToLoad, reelSlugFromPath } from './reels';

const reels = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('feedOrder', () => {
  it('starts at the reel in the URL and wraps round to the ones before it', () => {
    expect(feedOrder(reels, 'b').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(feedOrder(reels, 'a').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(feedOrder(reels, 'c').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the usual order for an unknown reel, and never changes its input', () => {
    expect(feedOrder(reels, 'zz').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    feedOrder(reels, 'c');
    expect(reels.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('reelSlugFromPath', () => {
  it('reads a reel page, with or without the trailing slash', () => {
    expect(reelSlugFromPath('/reels/latency/')).toBe('latency');
    expect(reelSlugFromPath('/reels/network-calls')).toBe('network-calls');
  });

  it('ignores the Reels tab and other pages', () => {
    expect(reelSlugFromPath('/reels/')).toBeNull();
    expect(reelSlugFromPath('/p/latency/')).toBeNull();
    expect(reelSlugFromPath('/reels/a/b/')).toBeNull();
  });
});

describe('postersToLoad', () => {
  it('loads the reel on screen and the next one only', () => {
    expect(postersToLoad(3, 0)).toEqual([0, 1]);
    expect(postersToLoad(3, 1)).toEqual([1, 2]);
    expect(postersToLoad(3, 2)).toEqual([2]);
  });

  it('loads nothing before a reel is on screen', () => {
    expect(postersToLoad(3, -1)).toEqual([]);
    expect(postersToLoad(0, 0)).toEqual([]);
  });
});
