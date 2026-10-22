import { describe, expect, it } from 'vitest';
import { asOf, githubLogin, isSnapshot, parseEvents, parseGraphql } from './github';
import { eventsAnswer, graphqlAnswer } from './github-fixtures';

describe('githubLogin', () => {
  it('reads the username from her profile link, and nothing else', () => {
    expect(githubLogin('https://github.com/bhoomi')).toBe('bhoomi');
    expect(githubLogin('https://github.com/Bhoomi-Jain21/')).toBe('Bhoomi-Jain21');
    expect(githubLogin(undefined)).toBeNull();
    expect(githubLogin('https://github.com/bhoomi/repo')).toBeNull();
    expect(githubLogin('https://evil.example/github.com/bhoomi')).toBeNull();
    expect(githubLogin('http://github.com/bhoomi')).toBeNull();
  });
});

describe('parseGraphql', () => {
  it('keeps exactly what GitHub said', () => {
    expect(parseGraphql(graphqlAnswer())).toEqual({
      login: 'bhoomi',
      name: 'Bhoomi Jain',
      url: 'https://github.com/bhoomi',
      days: [
        { date: '2026-10-18', count: 0 },
        { date: '2026-10-19', count: 3 },
        { date: '2026-10-20', count: 4 },
      ],
      contributionsLastYear: 7,
      commitsThisYear: 5,
      publicRepos: 2,
      repos: [
        {
          name: 'smartblog-ai',
          url: 'https://github.com/bhoomi/smartblog-ai',
          description: 'A blog',
          stars: 2,
          language: 'JavaScript',
          pushedAt: '2026-10-20T10:00:00Z',
        },
        {
          name: 'notes',
          url: 'https://github.com/bhoomi/notes',
          description: null,
          stars: 0,
          language: null,
          pushedAt: '2026-09-01T10:00:00Z',
        },
      ],
    });
  });

  it('throws rather than guess: errors, a missing user, a non-count, a bad date', () => {
    expect(() => parseGraphql({ errors: [{ message: 'Bad credentials' }] })).toThrow(
      'GitHub: Bad credentials',
    );
    expect(() => parseGraphql({ data: { user: null } })).toThrow('the user is missing');
    expect(() =>
      parseGraphql(graphqlAnswer({ thisYear: { totalCommitContributions: -1 } })),
    ).toThrow('not a count');
    const bad = graphqlAnswer();
    bad.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays[0].date =
      'yesterday';
    expect(() => parseGraphql(bad)).toThrow('a date is malformed');
    expect(() => parseGraphql('nope')).toThrow();
  });
});

describe('parseEvents', () => {
  it('tells only what happened, from the fields GitHub sent', () => {
    expect(parseEvents(eventsAnswer)).toEqual([
      {
        id: '1',
        summary: 'pushed 3 commits to main',
        repo: 'bhoomi/smartblog-ai',
        url: 'https://github.com/bhoomi/smartblog-ai',
        at: '2026-10-20T10:00:00Z',
      },
      {
        id: '3',
        summary: 'created a repository',
        repo: 'bhoomi/notes',
        url: 'https://github.com/bhoomi/notes',
        at: '2026-09-01T10:00:00Z',
      },
      {
        id: '4',
        summary: 'merged a pull request',
        repo: 'org/lib',
        url: 'https://github.com/org/lib/pull/9',
        at: '2026-08-01T10:00:00Z',
      },
      {
        id: '5',
        summary: 'released v1.0',
        repo: 'bhoomi/smartblog-ai',
        url: 'https://github.com/bhoomi/smartblog-ai/releases/v1.0',
        at: '2026-07-01T10:00:00Z',
      },
      {
        id: '6',
        summary: 'pushed commits',
        repo: 'bhoomi/x',
        url: 'https://github.com/bhoomi/x',
        at: '2026-06-01T10:00:00Z',
      },
    ]);
    expect(parseEvents(eventsAnswer, 2)).toHaveLength(2);
    expect(() => parseEvents({})).toThrow('events are missing');
  });
});

describe('isSnapshot and asOf', () => {
  it('recognises a stored snapshot, and says when it was true', () => {
    expect(
      isSnapshot({ version: 1, fetchedAt: 'x', login: 'b', days: [], repos: [], events: [] }),
    ).toBe(true);
    expect(isSnapshot({ version: 2 })).toBe(false);
    expect(isSnapshot(null)).toBe(false);
    expect(asOf('2026-10-22T14:05:00Z')).toBe('as of 22 Oct, 14:05 UTC');
  });
});
