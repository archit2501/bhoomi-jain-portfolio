/**
 * The hourly GitHub sync (task 4.2.1): a Cron Trigger (wrangler.jsonc) runs it, it asks GitHub
 * for her calendar, repositories and public events, and stores one snapshot in KV with the time
 * it was taken. If GitHub fails, the last good snapshot stays and screens keep showing it "as
 * of" its time; the failure is recorded beside it. Without her username (her profile's GitHub
 * link) or a token (GITHUB_TOKEN), it does nothing and screens say "unavailable".
 */
import {
  GITHUB_QUERY,
  isSnapshot,
  parseEvents,
  parseGraphql,
  type GithubSnapshot,
} from '../lib/github';

export const SNAPSHOT_KEY = 'github:snapshot';
export const STATUS_KEY = 'github:status';

/** The part of a KV namespace the sync needs, so tests can pass a Map. */
export interface SnapshotStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface SyncStatus {
  /** When the last sync ran (ISO). */
  attemptedAt: string;
  ok: boolean;
  /** Why it failed; never contains the token. */
  error?: string;
}

export interface SyncDeps {
  login: string | null;
  token?: string;
  store?: SnapshotStore;
  fetch?: typeof fetch;
  now?: () => Date;
}

export async function syncGithub(deps: SyncDeps): Promise<SyncStatus | { skipped: string }> {
  const { login, token, store } = deps;
  if (!store) return { skipped: 'no SNAPSHOTS binding' };
  if (!login) return { skipped: 'no GitHub link on her profile' };
  if (!token) return { skipped: 'no GITHUB_TOKEN' };
  const get = deps.fetch ?? fetch;
  const now = (deps.now ?? (() => new Date()))();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bhoomi-jain-portfolio',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  let status: SyncStatus;
  try {
    const [graph, events] = await Promise.all([
      get('https://api.github.com/graphql', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: GITHUB_QUERY,
          variables: { login, yearStart: `${now.getUTCFullYear()}-01-01T00:00:00Z` },
        }),
      }),
      get(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=50`, {
        headers,
      }),
    ]);
    if (!graph.ok) throw new Error(`GitHub GraphQL answered ${graph.status}`);
    if (!events.ok) throw new Error(`GitHub events answered ${events.status}`);
    const snapshot: GithubSnapshot = {
      version: 1,
      fetchedAt: now.toISOString(),
      ...parseGraphql(await graph.json()),
      events: parseEvents(await events.json()),
    };
    await store.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
    status = { attemptedAt: now.toISOString(), ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status = {
      attemptedAt: now.toISOString(),
      ok: false,
      error: message.replaceAll(token, '[token]').slice(0, 200),
    };
  }
  await store.put(STATUS_KEY, JSON.stringify(status));
  return status;
}

const parse = (raw: string | null): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * The snapshot to show, if there is one for this login, and how the last sync went. A snapshot
 * of someone else (the profile link changed) is not hers, so it isn't shown.
 */
export async function readGithub(
  store: SnapshotStore | undefined,
  login: string | null,
): Promise<{ snapshot: GithubSnapshot | null; status: SyncStatus | null }> {
  if (!store || !login) return { snapshot: null, status: null };
  const [raw, rawStatus] = await Promise.all([store.get(SNAPSHOT_KEY), store.get(STATUS_KEY)]);
  const snapshot = parse(raw);
  const status = parse(rawStatus) as SyncStatus | null;
  const hers = isSnapshot(snapshot) && snapshot.login.toLowerCase() === login.toLowerCase();
  return { snapshot: hers ? snapshot : null, status };
}

/** GET /api/github: the snapshot, or "unavailable". Cached for five minutes. */
export async function githubResponse(
  store: SnapshotStore | undefined,
  login: string | null,
): Promise<Response> {
  const { snapshot, status } = await readGithub(store, login);
  const headers = { 'Cache-Control': 'public, max-age=300' };
  if (!snapshot) {
    return Response.json(
      { ok: false, error: 'unavailable', lastAttempt: status?.attemptedAt ?? null },
      { headers },
    );
  }
  return Response.json(
    { ok: true, snapshot, lastSync: status ?? { attemptedAt: snapshot.fetchedAt, ok: true } },
    { headers },
  );
}
