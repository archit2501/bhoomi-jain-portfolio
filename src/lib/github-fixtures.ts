/** Test data shaped like GitHub's answers (GraphQL and REST events). Test-only. */
export const graphqlAnswer = (overrides: Record<string, unknown> = {}) => ({
  data: {
    user: {
      login: 'bhoomi',
      name: 'Bhoomi Jain',
      url: 'https://github.com/bhoomi',
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 7,
          weeks: [
            {
              contributionDays: [
                { date: '2026-10-18', contributionCount: 0 },
                { date: '2026-10-19', contributionCount: 3 },
              ],
            },
            { contributionDays: [{ date: '2026-10-20', contributionCount: 4 }] },
          ],
        },
      },
      thisYear: { totalCommitContributions: 5 },
      repositories: {
        totalCount: 2,
        nodes: [
          {
            name: 'smartblog-ai',
            url: 'https://github.com/bhoomi/smartblog-ai',
            description: 'A blog',
            stargazerCount: 2,
            primaryLanguage: { name: 'JavaScript' },
            pushedAt: '2026-10-20T10:00:00Z',
          },
          {
            name: 'notes',
            url: 'https://github.com/bhoomi/notes',
            description: null,
            stargazerCount: 0,
            primaryLanguage: null,
            pushedAt: '2026-09-01T10:00:00Z',
          },
        ],
      },
      ...overrides,
    },
  },
});

export const eventsAnswer = [
  {
    id: '1',
    type: 'PushEvent',
    repo: { name: 'bhoomi/smartblog-ai' },
    payload: { ref: 'refs/heads/main', size: 3 },
    created_at: '2026-10-20T10:00:00Z',
  },
  {
    id: '2',
    type: 'WatchEvent',
    repo: { name: 'someone/else' },
    payload: { action: 'started' },
    created_at: '2026-10-19T10:00:00Z',
  },
  {
    id: '3',
    type: 'CreateEvent',
    repo: { name: 'bhoomi/notes' },
    payload: { ref_type: 'repository' },
    created_at: '2026-09-01T10:00:00Z',
  },
  {
    id: '4',
    type: 'PullRequestEvent',
    repo: { name: 'org/lib' },
    payload: {
      action: 'closed',
      pull_request: { merged: true, html_url: 'https://github.com/org/lib/pull/9' },
    },
    created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: '5',
    type: 'ReleaseEvent',
    repo: { name: 'bhoomi/smartblog-ai' },
    payload: {
      action: 'published',
      release: { name: 'v1.0', html_url: 'https://github.com/bhoomi/smartblog-ai/releases/v1.0' },
    },
    created_at: '2026-07-01T10:00:00Z',
  },
  {
    id: '6',
    type: 'PushEvent',
    repo: { name: 'bhoomi/x' },
    payload: {},
    created_at: '2026-06-01T10:00:00Z',
  },
  { type: 'PushEvent', repo: { name: 'bhoomi/broken' } },
];
