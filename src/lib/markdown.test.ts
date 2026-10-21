import { describe, expect, it } from 'vitest';
import { plainText } from './markdown';

describe('plainText', () => {
  it('keeps the words and drops the markup', () => {
    expect(plainText('**Stack:** ReactJS · `Node.js` and _MongoDB_')).toBe(
      'Stack: ReactJS · Node.js and MongoDB',
    );
    expect(plainText('See [the repo](https://example.com) or ![a shot](a.png).')).toBe(
      'See the repo or a shot.',
    );
  });

  it('drops headings, list markers and quotes, and joins paragraphs', () => {
    expect(plainText('# Title\n\n- one\n- two\n1. three\n> quoted\n\nNext para')).toBe(
      'Title\none\ntwo\nthree\nquoted\nNext para',
    );
  });

  it('leaves plain prose alone, including ~ and figures', () => {
    expect(plainText('Cut calls by ~45% in 2024 – 2025.')).toBe(
      'Cut calls by ~45% in 2024 – 2025.',
    );
  });
});
