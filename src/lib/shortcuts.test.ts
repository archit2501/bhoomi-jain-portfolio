import { describe, expect, it } from 'vitest';
import { GO, SHORTCUTS, shortcutFor } from './shortcuts';

describe('shortcutFor', () => {
  it('single keys, either case', () => {
    expect(['/', '?', 'j', 'K', 'l', 'S', 'm', ' '].map((k) => shortcutFor(k, false))).toEqual([
      'search',
      'help',
      'next',
      'previous',
      'like',
      'save',
      'mute',
      'pause',
    ]);
    expect(shortcutFor('x', false)).toBeNull();
    expect(shortcutFor('Enter', false)).toBeNull();
  });

  it('G then a letter goes somewhere; anything else does nothing', () => {
    expect(['h', 'E', 'r', 'm', 'p'].map((k) => shortcutFor(k, true))).toEqual([
      'go:/feed/',
      'go:/explore/',
      'go:/reels/',
      'go:/direct/',
      'go:/',
    ]);
    expect(shortcutFor('j', true)).toBeNull();
  });

  it('the list shows every "G then" place', () => {
    const listed = SHORTCUTS.filter((s) => s.keys[0] === 'G').map((s) => s.keys[1].toLowerCase());
    expect(listed.sort()).toEqual(Object.keys(GO).sort());
  });
});
