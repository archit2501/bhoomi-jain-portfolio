import { describe, expect, it } from 'vitest';
import { postDate } from './post-date';

describe('postDate', () => {
  it('shows a year on its own', () => {
    expect(postDate('2024')).toEqual({ datetime: '2024', text: '2024' });
  });

  it('formats a month or a day as month and year', () => {
    expect(postDate('2023-07')).toEqual({ datetime: '2023-07', text: 'July 2023' });
    expect(postDate('2023-07-14')).toEqual({ datetime: '2023-07-14', text: 'July 2023' });
  });

  it('prefers the label but keeps the machine-readable date', () => {
    expect(postDate('2023-07', 'Jul – Sep 2023')).toEqual({
      datetime: '2023-07',
      text: 'Jul – Sep 2023',
    });
  });

  it('shows a label without a date, and nothing when there is neither', () => {
    expect(postDate(undefined, 'Ongoing')).toEqual({ datetime: '', text: 'Ongoing' });
    expect(postDate()).toBeUndefined();
  });

  it('rejects anything that is not YYYY, YYYY-MM or YYYY-MM-DD', () => {
    for (const bad of ['24', '2023-13', '2023-7', 'July 2023', '2023-07-32']) {
      expect(() => postDate(bad)).toThrow(/Not a post date/);
    }
  });
});
