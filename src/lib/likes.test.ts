import { describe, expect, it } from 'vitest';
import { isLiked, likeKey, likesLine, saveLiked, type LikeStore } from './likes';

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
  it('shows only the visitor’s own like until there is a count', () => {
    expect(likesLine(true)).toBe('Liked by you');
    expect(likesLine(false)).toBeNull();
  });

  it('keeps counts under 10 to itself', () => {
    expect(likesLine(false, 9)).toBeNull();
    expect(likesLine(true, 9)).toBe('Liked by you');
  });

  it('words counts from 10 up as Instagram does', () => {
    expect(likesLine(false, 10)).toBe('10 likes');
    expect(likesLine(false, 1234)).toBe('1,234 likes');
    expect(likesLine(true, 10)).toBe('Liked by you and 9 others');
    expect(likesLine(true, 1235)).toBe('Liked by you and 1,234 others');
  });
});
