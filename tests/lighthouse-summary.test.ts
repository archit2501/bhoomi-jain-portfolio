import { describe, expect, it } from 'vitest';
import { pagePath, summarize } from '../scripts/lighthouse-summary.mjs';

const run = (url: string, representative: boolean, summary: Record<string, number>) => ({
  url: `http://localhost:56267${url}`,
  isRepresentativeRun: representative,
  jsonPath: `${url}.json`,
  summary,
});
const all = { performance: 0.99, accessibility: 1, 'best-practices': 0.96, seo: 1 };
const reports: Record<string, { fetchTime: string; lighthouseVersion: string }> = {
  '/index.html.json': { fetchTime: '2026-10-22T14:00:05Z', lighthouseVersion: '12.6.1' },
  '/p/smartblog-ai/index.html.json': {
    fetchTime: '2026-10-22T14:00:01Z',
    lighthouseVersion: '12.6.1',
  },
  '/404.html.json': { fetchTime: '2026-10-22T14:00:09Z', lighthouseVersion: '12.6.1' },
};
const read = (path: string) => reports[path];

describe('lighthouse summary', () => {
  it('names pages by their site path', () => {
    expect(pagePath('http://localhost:1/index.html')).toBe('/');
    expect(pagePath('http://localhost:1/p/smartblog-ai/index.html')).toBe('/p/smartblog-ai/');
    expect(pagePath('http://localhost:1/404.html')).toBe('/404');
  });

  it('keeps each page’s representative run, as 0–100, with when and where it was measured', () => {
    const summary = summarize(
      [
        run('/index.html', false, { ...all, performance: 0.5 }),
        run('/index.html', true, all),
        run('/p/smartblog-ai/index.html', true, { ...all, performance: 0.914 }),
        run('/404.html', true, all),
      ],
      read,
      { source: 'https://github.com/o/r/actions/runs/1', commit: 'abc' },
    );
    expect(summary).toEqual({
      version: 1,
      measuredAt: '2026-10-22T14:00:01Z',
      lighthouseVersion: '12.6.1',
      source: 'https://github.com/o/r/actions/runs/1',
      commit: 'abc',
      pages: [
        {
          path: '/',
          scores: { performance: 99, accessibility: 100, 'best-practices': 96, seo: 100 },
        },
        {
          path: '/p/smartblog-ai/',
          scores: { performance: 91, accessibility: 100, 'best-practices': 96, seo: 100 },
        },
        {
          path: '/404',
          scores: { performance: 99, accessibility: 100, 'best-practices': 96, seo: 100 },
        },
      ],
    });
  });

  it('refuses a run without scores, or no runs at all, rather than write zeros', () => {
    expect(() => summarize([run('/index.html', true, { performance: 1 })], read, {})).toThrow(
      'no accessibility score',
    );
    expect(() => summarize([run('/index.html', false, all)], read, {})).toThrow(
      'no representative runs',
    );
  });
});
