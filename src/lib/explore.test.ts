import { describe, expect, it } from 'vitest';
import { exploreLayout, interleave } from './explore';

const reels = ['r1', 'r2', 'r3'];
const posts = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);

describe('exploreLayout', () => {
  it('pairs each tall reel with four tiles, alternating right and left', () => {
    const tiles = exploreLayout(reels, posts);
    expect(tiles.slice(0, 10)).toEqual([
      { item: 'r1', tall: { column: 3 } },
      { item: 'p1' },
      { item: 'p2' },
      { item: 'p3' },
      { item: 'p4' },
      { item: 'r2', tall: { column: 1 } },
      { item: 'p5' },
      { item: 'p6' },
      { item: 'p7' },
      { item: 'p8' },
    ]);
  });

  it('puts what is left in plain rows, and shows everything once', () => {
    const tiles = exploreLayout(reels, posts);
    expect(tiles.slice(10)).toEqual([{ item: 'p9' }, { item: 'p10' }, { item: 'r3' }]);
    expect(tiles.map((t) => t.item).sort()).toEqual([...reels, ...posts].sort());
  });

  it('never makes a tall tile without four tiles beside it', () => {
    expect(exploreLayout(reels, posts.slice(0, 3))).toEqual([
      { item: 'p1' },
      { item: 'p2' },
      { item: 'p3' },
      { item: 'r1' },
      { item: 'r2' },
      { item: 'r3' },
    ]);
    expect(exploreLayout([], posts.slice(0, 2))).toEqual([{ item: 'p1' }, { item: 'p2' }]);
  });
});

describe('interleave', () => {
  it('spreads the shorter list evenly through the longer one, keeping both orders', () => {
    expect(interleave(['p1', 'p2', 'p3', 'p4'], ['s1', 's2'])).toEqual([
      'p1',
      's1',
      'p2',
      'p3',
      's2',
      'p4',
    ]);
    expect(interleave(['a'], [])).toEqual(['a']);
    expect(interleave([], ['b', 'c'])).toEqual(['b', 'c']);
  });
});
