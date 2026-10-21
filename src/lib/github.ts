/**
 * Her GitHub, as the site keeps it (task 4.2.1): a snapshot pulled every hour by the sync in
 * src/workers/github-sync.ts and stored in KV with the time it was taken. Every number in it
 * comes from GitHub's API. Nothing here invents one: no snapshot means "unavailable".
 */

export interface GithubDay {
  /** YYYY-MM-DD */
  date: string;
  count: number;
}

export interface GithubRepo {
  name: string;
  url: string;
  description: string | null;
  stars: number;
  language: string | null;
  /** ISO time of the last push. */
  pushedAt: string;
}

export interface GithubEvent {
  id: string;
  /** What happened, in a few words: "pushed 3 commits to main", "created a repository". */
  summary: string;
  repo: string;
  url: string;
  /** ISO time. */
  at: string;
}

export interface GithubSnapshot {
  version: 1;
  /** When the sync took it (ISO). Screens show it as "as of". */
  fetchedAt: string;
  login: string;
  name: string | null;
  url: string;
  /** The contribution calendar for the past year, oldest day first. */
  days: GithubDay[];
  contributionsLastYear: number;
  /** Commits this calendar year (UTC), as GitHub counts them. */
  commitsThisYear: number;
  publicRepos: number;
  /** Her own public repositories, most recently pushed first. */
  repos: GithubRepo[];
  /** Her latest public activity, newest first. */
  events: GithubEvent[];
}

/** The username in a GitHub profile link, or null: "https://github.com/bhoomi" → "bhoomi". */
export function githubLogin(link: string | undefined): string | null {
  if (!link) return null;
  const match = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/?$/.exec(
    link.trim(),
  );
  return match ? match[1] : null;
}

/** The GraphQL query the sync sends: her calendar, this year's commits and her repositories. */
export const GITHUB_QUERY = `query ($login: String!, $yearStart: DateTime!) {
  user(login: $login) {
    login
    name
    url
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    thisYear: contributionsCollection(from: $yearStart) {
      totalCommitContributions
    }
    repositories(
      first: 12
      ownerAffiliations: OWNER
      privacy: PUBLIC
      isFork: false
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      nodes { name url description stargazerCount primaryLanguage { name } pushedAt }
    }
  }
}`;

type Json = Record<string, unknown>;
const object = (value: unknown, what: string): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`GitHub: ${what} is missing`);
  }
  return value as Json;
};
const array = (value: unknown, what: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`GitHub: ${what} is missing`);
  return value;
};
const count = (value: unknown, what: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`GitHub: ${what} is not a count`);
  }
  return value;
};
const text = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !value) throw new Error(`GitHub: ${what} is missing`);
  return value;
};
const optional = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

/** The GraphQL answer, checked field by field. Throws rather than guess at anything missing. */
export function parseGraphql(
  body: unknown,
): Omit<GithubSnapshot, 'version' | 'fetchedAt' | 'events'> {
  const root = object(body, 'the response');
  if (Array.isArray(root.errors) && root.errors.length) {
    const first = object(root.errors[0], 'the error');
    throw new Error(`GitHub: ${String(first.message ?? 'query failed')}`);
  }
  const user = object(object(root.data, 'data').user, 'the user');
  const calendar = object(
    object(user.contributionsCollection, 'contributions').contributionCalendar,
    'the calendar',
  );
  const days = array(calendar.weeks, 'weeks').flatMap((week) =>
    array(object(week, 'a week').contributionDays, 'days').map((day) => {
      const d = object(day, 'a day');
      const date = text(d.date, 'a date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('GitHub: a date is malformed');
      return { date, count: count(d.contributionCount, 'a day') };
    }),
  );
  const repos = object(user.repositories, 'repositories');
  return {
    login: text(user.login, 'the login'),
    name: optional(user.name),
    url: text(user.url, 'the profile link'),
    days,
    contributionsLastYear: count(calendar.totalContributions, 'contributions'),
    commitsThisYear: count(object(user.thisYear, 'this year').totalCommitContributions, 'commits'),
    publicRepos: count(repos.totalCount, 'repositories'),
    repos: array(repos.nodes, 'repositories').map((node) => {
      const r = object(node, 'a repository');
      return {
        name: text(r.name, 'a repository name'),
        url: text(r.url, 'a repository link'),
        description: optional(r.description),
        stars: count(r.stargazerCount, 'stars'),
        language: optional((r.primaryLanguage as Json | null)?.name),
        pushedAt: text(r.pushedAt, 'a push time'),
      };
    }),
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Her public events (REST /users/<login>/events/public), as lines for Notifications. Only the
 * kinds worth telling are kept, and only from fields GitHub actually sent; anything else is
 * skipped rather than described from a guess.
 */
export function parseEvents(body: unknown, limit = 20): GithubEvent[] {
  if (!Array.isArray(body)) throw new Error('GitHub: events are missing');
  const events: GithubEvent[] = [];
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Json;
    const repo = (e.repo as Json | undefined)?.name;
    const payload = (e.payload as Json | undefined) ?? {};
    if (typeof e.id !== 'string' || typeof repo !== 'string' || typeof e.created_at !== 'string') {
      continue;
    }
    const repoUrl = `https://github.com/${repo}`;
    let summary: string | null = null;
    let url = repoUrl;
    switch (e.type) {
      case 'PushEvent': {
        const size = typeof payload.size === 'number' ? payload.size : null;
        const branch =
          typeof payload.ref === 'string' ? payload.ref.replace(/^refs\/heads\//, '') : null;
        summary = `pushed ${size === null ? 'commits' : plural(size, 'commit')}${branch ? ` to ${branch}` : ''}`;
        break;
      }
      case 'CreateEvent':
        if (payload.ref_type === 'repository') summary = 'created a repository';
        else if (payload.ref_type === 'tag' && typeof payload.ref === 'string') {
          summary = `tagged ${payload.ref}`;
        }
        break;
      case 'ReleaseEvent': {
        const release = payload.release as Json | undefined;
        if (payload.action === 'published' && release) {
          summary = `released ${String(release.name || release.tag_name || 'a new version')}`;
          if (typeof release.html_url === 'string') url = release.html_url;
        }
        break;
      }
      case 'PullRequestEvent': {
        const pr = payload.pull_request as Json | undefined;
        if (pr && (payload.action === 'opened' || (payload.action === 'closed' && pr.merged))) {
          summary = `${payload.action === 'opened' ? 'opened' : 'merged'} a pull request`;
          if (typeof pr.html_url === 'string') url = pr.html_url;
        }
        break;
      }
      case 'PublicEvent':
        summary = 'made a repository public';
        break;
    }
    if (summary) events.push({ id: e.id, summary, repo, url, at: e.created_at });
    if (events.length >= limit) break;
  }
  return events;
}

/** Whether a stored value is a snapshot this code can show. */
export function isSnapshot(value: unknown): value is GithubSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<GithubSnapshot>;
  return (
    s.version === 1 &&
    typeof s.fetchedAt === 'string' &&
    typeof s.login === 'string' &&
    Array.isArray(s.days) &&
    Array.isArray(s.repos) &&
    Array.isArray(s.events)
  );
}

/** "as of 22 Oct, 14:05 UTC": when the numbers were true. */
export function asOf(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `as of ${day}, ${time} UTC`;
}
