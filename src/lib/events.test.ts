import { describe, expect, it } from 'vitest';
import {
  careerActivity,
  commentActivity,
  githubActivity,
  groupActivity,
  newestFirst,
  relativeTime,
  toTime,
  type Activity,
} from './events';

const item = (id: string, at: string): Activity => ({
  id,
  kind: 'github',
  text: id,
  href: '#',
  at,
});
const now = new Date(2026, 9, 22, 15, 0); // local time: 22 Oct 2026, 15:00

describe('toTime', () => {
  it('reads years, months, days and times', () => {
    expect(toTime('2024')).toBe(Date.UTC(2024, 0, 1));
    expect(toTime('2023-07')).toBe(Date.UTC(2023, 6, 1));
    expect(toTime('2026-10-22')).toBe(Date.UTC(2026, 9, 22));
    expect(toTime('2026-10-22T09:00:00Z')).toBe(Date.UTC(2026, 9, 22, 9));
    expect(() => toTime('soon')).toThrow('Not a date');
  });
});

describe('newestFirst', () => {
  it('merges every source into one list, newest first, ties in order', () => {
    const merged = newestFirst(
      [item('job', '2023-07'), item('push', '2026-10-21T10:00:00Z')],
      [item('comment', '2026-10-22T09:00:00Z'), item('degree', '2023-07')],
    );
    expect(merged.map((i) => i.id)).toEqual(['comment', 'push', 'job', 'degree']);
  });
});

describe('groupActivity', () => {
  const at = (date: Date) => date.toISOString();
  const items = newestFirst([
    item('an hour ago', at(new Date(2026, 9, 22, 14, 0))),
    item('this morning', at(new Date(2026, 9, 22, 8, 0))),
    item('three days ago', at(new Date(2026, 9, 19, 12, 0))),
    item('last month', at(new Date(2026, 8, 1, 12, 0))),
    item('a month, given as a month', '2026-10'),
  ]);

  it('Today, This week, Earlier on a first visit: nothing is "New" without a last look', () => {
    expect(groupActivity(items, now, null).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual(
      [
        ['Today', ['an hour ago', 'this morning']],
        ['This week', ['three days ago']],
        ['Earlier', ['a month, given as a month', 'last month']],
      ],
    );
  });

  it('"New" is what came since the last look', () => {
    const lastSeen = new Date(2026, 9, 22, 12, 0).getTime();
    expect(groupActivity(items, now, lastSeen).map((g) => [g.label, g.items.length])).toEqual([
      ['New', 1],
      ['Today', 1],
      ['This week', 1],
      ['Earlier', 2],
    ]);
    expect(groupActivity([], now, lastSeen)).toEqual([]);
  });
});

describe('relativeTime', () => {
  it('short for recent, the month or year for older', () => {
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(relativeTime(ago(30_000), now)).toBe('1m');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5m');
    expect(relativeTime(ago(3 * 3600_000), now)).toBe('3h');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2d');
    expect(relativeTime(ago(15 * 86_400_000), now)).toBe('2w');
    expect(relativeTime('2026-01-15T00:00:00Z', now)).toBe('Jan 2026');
    expect(relativeTime('2023-07', now)).toBe('Jul 2023');
    expect(relativeTime('2024', now)).toBe('2024');
  });
});

describe('sources', () => {
  it('career milestones link to the post that tells them, or are left out', () => {
    const posts = [{ id: 'themobiadz', data: { resumeRef: 'experience/themobiadz' } }];
    expect(
      careerActivity(
        [
          {
            id: 'themobiadz',
            data: {
              date: '2023-07',
              kind: 'job',
              title: 'Started as intern',
              org: 'TheMobiAdz',
              ref: 'experience/themobiadz',
            },
          },
          {
            id: 'site',
            data: {
              date: '2026-10',
              kind: 'site',
              title: 'Site launched',
              href: 'https://example.com/',
            },
          },
          {
            id: 'orphan',
            data: { date: '2022', kind: 'job', title: 'No post', ref: 'experience/none' },
          },
        ],
        posts,
      ),
    ).toEqual([
      {
        id: 'event:themobiadz',
        kind: 'job',
        text: 'Started as intern · TheMobiAdz',
        href: '/p/themobiadz/',
        external: false,
        at: '2023-07',
      },
      {
        id: 'event:site',
        kind: 'site',
        text: 'Site launched',
        href: 'https://example.com/',
        external: true,
        at: '2026-10',
      },
    ]);
  });

  it('GitHub events and approved comments, each with its link', () => {
    expect(
      githubActivity([
        {
          id: '1',
          summary: 'pushed 3 commits to main',
          repo: 'b/x',
          url: 'https://github.com/b/x',
          at: '2026-10-21T10:00:00Z',
        },
      ]),
    ).toEqual([
      {
        id: 'github:1',
        kind: 'github',
        text: 'pushed 3 commits to main in b/x',
        href: 'https://github.com/b/x',
        external: true,
        at: '2026-10-21T10:00:00Z',
      },
    ]);
    expect(
      commentActivity(
        [
          {
            id: 'c',
            post: 'smartblog-ai',
            name: 'Priya',
            excerpt: 'Great!',
            at: '2026-10-22T09:00:00Z',
          },
          { id: 'd', post: 'gone', name: 'X', excerpt: 'Hm', at: '2026-10-22T09:00:00Z' },
        ],
        { 'smartblog-ai': 'SmartBlog AI' },
      ),
    ).toEqual([
      {
        id: 'comment:c',
        kind: 'comment',
        text: 'Priya commented on SmartBlog AI: “Great!”',
        href: '/p/smartblog-ai/',
        at: '2026-10-22T09:00:00Z',
      },
    ]);
  });
});
