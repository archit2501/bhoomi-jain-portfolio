import { describe, expect, it } from 'vitest';
import {
  isLiked,
  likeKey,
  likesLine,
  likesParts,
  odometer,
  saveLiked,
  type LikeStore,
} from './likes';

function memoryStore(): LikeStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const blocked: LikeStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('like storage', () => {
  it('remembers a like per post and forgets it on unlike', () => {
    const store = memoryStore();
    expect(isLiked(store, 'smartblog-ai')).toBe(false);
    expect(saveLiked(store, 'smartblog-ai', true)).toBe(true);
    expect(store.data.get(likeKey('smartblog-ai'))).toBe('1');
    expect(isLiked(store, 'smartblog-ai')).toBe(true);
    expect(isLiked(store, 'wearduds')).toBe(false);
    saveLiked(store, 'smartblog-ai', false);
    expect(isLiked(store, 'smartblog-ai')).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('treats blocked or missing storage as not liked, without throwing', () => {
    expect(isLiked(blocked, 'a')).toBe(false);
    expect(saveLiked(blocked, 'a', true)).toBe(false);
    expect(isLiked(undefined, 'a')).toBe(false);
    expect(saveLiked(undefined, 'a', true)).toBe(false);
  });
});

describe('likesLine', () => {
  it('shows only the visitor’s own like until the database answers', () => {
    expect(likesLine(true)).toBe('Liked by you');
    expect(likesLine(false)).toBeNull();
  });

  it('says nothing about a post nobody has liked', () => {
    expect(likesLine(false, 0)).toBeNull();
    expect(likesLine(true, 0)).toBe('Liked by you');
  });

  it("keeps counts under 10 to itself: 'Liked by visitors'", () => {
    expect(likesLine(false, 9)).toBe('Liked by visitors');
    expect(likesLine(false, 1)).toBe('Liked by visitors');
    expect(likesLine(true, 1)).toBe('Liked by you');
    expect(likesLine(true, 9)).toBe('Liked by you and others');
  });

  it('words counts from 10 up as Instagram does', () => {
    expect(likesLine(false, 10)).toBe('10 likes');
    expect(likesLine(false, 1234)).toBe('1,234 likes');
    expect(likesLine(true, 10)).toBe('Liked by you and 9 others');
    expect(likesLine(true, 1235)).toBe('Liked by you and 1,234 others');
  });
});

describe('likesParts', () => {
  it('splits out the number the odometer rolls', () => {
    expect(likesParts(true, 25)).toEqual({
      before: 'Liked by you and ',
      count: 24,
      after: ' others',
    });
    expect(likesParts(false, 25)).toEqual({ before: '', count: 25, after: ' likes' });
    expect(likesParts(false, 5)).toEqual({ before: 'Liked by visitors', count: null, after: '' });
    expect(likesParts(false)).toBeNull();
  });
});

describe('odometer', () => {
  it('rolls only the digits that change, in the direction of the change', () => {
    expect(odometer(10, 11)).toEqual([
      { char: '1', roll: null },
      { char: '1', roll: 'up' },
    ]);
    expect(odometer(20, 19)).toEqual([
      { char: '1', roll: 'down' },
      { char: '9', roll: 'down' },
    ]);
  });

  it('rolls new places in and keeps the grouping comma', () => {
    expect(
      odometer(999, 1000)
        .map((d) => d.char)
        .join(''),
    ).toBe('1,000');
    expect(odometer(999, 1000).every((d) => d.roll === 'up')).toBe(true);
    expect(
      odometer(1000, 999)
        .map((d) => d.char)
        .join(''),
    ).toBe('999');
    expect(odometer(42, 42).every((d) => d.roll === null)).toBe(true);
  });
});
