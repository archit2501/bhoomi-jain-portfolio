import { describe, expect, it } from 'vitest';
import { pageTitle, tileTone } from './site';

describe('pageTitle', () => {
  it('uses her name and role on the home page', () => {
    expect(pageTitle()).toBe('Bhoomi Jain · Full Stack Developer');
  });

  it('puts the page name first on inner pages', () => {
    expect(pageTitle('SmartBlog AI')).toBe('SmartBlog AI · Bhoomi Jain');
  });

  it('falls back to the home title for a blank page name', () => {
    expect(pageTitle('   ')).toBe('Bhoomi Jain · Full Stack Developer');
  });

  it('never mentions Instagram', () => {
    expect(pageTitle().toLowerCase()).not.toContain('instagram');
    expect(pageTitle('Highlights').toLowerCase()).not.toContain('instagram');
  });
});

describe('tileTone', () => {
  it('shifts one step each row so no column is a single colour', () => {
    const grid = Array.from({ length: 9 }, (_, i) => tileTone(i + 1));
    expect(grid).toEqual([1, 2, 3, 2, 3, 1, 3, 1, 2]);
    for (let col = 0; col < 3; col++) {
      expect(new Set([grid[col], grid[col + 3], grid[col + 6]]).size).toBe(3);
    }
  });
});
