import { describe, expect, it } from 'vitest';
import { wrapText } from './og';

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('$100K+', 18, 2)).toEqual(['$100K+']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText('Content to dispatch, 5+ regions', 21, 2)).toEqual([
      'Content to dispatch,',
      '5+ regions',
    ]);
  });

  it('cuts to the line limit with an ellipsis', () => {
    expect(wrapText('one two three four five six', 7, 2)).toEqual(['one two', 'three…']);
  });

  it('never splits a word that is longer than a line', () => {
    expect(wrapText('supercalifragilistic word', 5, 3)).toEqual(['supercalifragilistic', 'word']);
  });

  it('returns no lines for empty text', () => {
    expect(wrapText('   ', 10, 2)).toEqual([]);
  });
});
