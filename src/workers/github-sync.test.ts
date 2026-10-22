import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GithubSnapshot } from '../lib/github';
import { eventsAnswer, graphqlAnswer } from '../lib/github-fixtures';
import { localBindings, type LocalBindings } from '../lib/server/testing';
import {
  githubResponse,
  readGithub,
  SNAPSHOT_KEY,
  STATUS_KEY,
  syncGithub,
  type SnapshotStore,
} from './github-sync';

const memory = (): SnapshotStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    put: async (key, value) => void data.set(key, value),
  };
};

type Call = { url: string; init: RequestInit };
function github(
  answers: { graph?: unknown; graphStatus?: number; events?: unknown; eventsStatus?: number } = {},
) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/graphql')) {
      return Response.json(answers.graph ?? graphqlAnswer(), {
        status: answers.graphStatus ?? 200,
      });
    }
    return Response.json(answers.events ?? eventsAnswer, { status: answers.eventsStatus ?? 200 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const at = (iso: string) => () => new Date(iso);
type Served = { ok: boolean; snapshot: GithubSnapshot; lastSync: unknown };

describe('syncGithub', () => {
  it('stores one snapshot with the time it was taken', async () => {
    const store = memory();
    const api = github();
    const status = await syncGithub({
      login: 'bhoomi',
      token: 'ghp_secret',
      store,
      fetch: api.fetch,
      now: at('2026-10-22T14:07:00Z'),
    });
    expect(status).toEqual({ attemptedAt: '2026-10-22T14:07:00.000Z', ok: true });
    const snapshot = JSON.parse(store.data.get(SNAPSHOT_KEY)!);
    expect(snapshot).toMatchObject({
      version: 1,
      fetchedAt: '2026-10-22T14:07:00.000Z',
      login: 'bhoomi',
      commitsThisYear: 5,
      publicRepos: 2,
    });
    expect(snapshot.events).toHaveLength(5);
    // This year's commits count from 1 January, UTC; the token goes only in the header.
    const graph = api.calls.find((c) => c.url.endsWith('/graphql'))!;
    expect(JSON.parse(String(graph.init.body)).variables).toEqual({
      login: 'bhoomi',
      yearStart: '2026-01-01T00:00:00Z',
    });
    expect((graph.init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_secret');
    expect(api.calls.map((c) => c.url)).toContain(
      'https://api.github.com/users/bhoomi/events/public?per_page=50',
    );
  });

  it('keeps the last good snapshot when GitHub fails, and records why without the token', async () => {
    const store = memory();
    await syncGithub({
      login: 'bhoomi',
      token: 't0k',
      store,
      fetch: github().fetch,
      now: at('2026-10-22T13:07:00Z'),
    });
    const good = store.data.get(SNAPSHOT_KEY);

    for (const answers of [
      { graphStatus: 502 },
      { eventsStatus: 403 },
      { graph: { errors: [{ message: 'Bad credentials t0k' }] } },
      { graph: { data: { user: null } } },
    ]) {
      const status = await syncGithub({
        login: 'bhoomi',
        token: 't0k',
        store,
        fetch: github(answers).fetch,
        now: at('2026-10-22T14:07:00Z'),
      });
      expect(status).toMatchObject({ ok: false, attemptedAt: '2026-10-22T14:07:00.000Z' });
      expect(store.data.get(SNAPSHOT_KEY)).toBe(good);
      expect(store.data.get(STATUS_KEY)).not.toContain('t0k');
    }
    const { snapshot, status } = await readGithub(store, 'bhoomi');
    expect(snapshot?.fetchedAt).toBe('2026-10-22T13:07:00.000Z');
    expect(status).toMatchObject({ ok: false });
  });

  it('does nothing without her username, a token or the store', async () => {
    const api = github();
    expect(
      await syncGithub({ login: null, token: 't', store: memory(), fetch: api.fetch }),
    ).toEqual({
      skipped: 'no GitHub link on her profile',
    });
    expect(await syncGithub({ login: 'bhoomi', store: memory(), fetch: api.fetch })).toEqual({
      skipped: 'no GITHUB_TOKEN',
    });
    expect(await syncGithub({ login: 'bhoomi', token: 't', fetch: api.fetch })).toEqual({
      skipped: 'no SNAPSHOTS binding',
    });
    expect(api.calls).toEqual([]);
  });
});

describe('GET /api/github', () => {
  it('is "unavailable" with no snapshot, never a made-up number', async () => {
    const res = await githubResponse(memory(), 'bhoomi');
    expect(await res.json()).toEqual({ ok: false, error: 'unavailable', lastAttempt: null });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(await (await githubResponse(undefined, null)).json()).toMatchObject({ ok: false });
  });

  it("serves her snapshot with its time, but not someone else's", async () => {
    const store = memory();
    await syncGithub({
      login: 'bhoomi',
      token: 't',
      store,
      fetch: github().fetch,
      now: at('2026-10-22T14:07:00Z'),
    });
    const body = (await (await githubResponse(store, 'Bhoomi')).json()) as Served;
    expect(body.ok).toBe(true);
    expect(body.snapshot.fetchedAt).toBe('2026-10-22T14:07:00.000Z');
    expect(body.lastSync).toEqual({ attemptedAt: '2026-10-22T14:07:00.000Z', ok: true });
    expect(await (await githubResponse(store, 'someone-else')).json()).toMatchObject({
      ok: false,
      error: 'unavailable',
    });
  });
});

describe('on the real local KV binding', () => {
  let env: LocalBindings & { SNAPSHOTS: SnapshotStore };
  let dispose: () => Promise<void>;
  beforeAll(async () => {
    const local = await localBindings();
    env = local.env as typeof env;
    dispose = local.dispose;
  }, 120_000);
  afterAll(async () => dispose?.());

  it('the sync writes the snapshot the API serves', async () => {
    await syncGithub({
      login: 'bhoomi',
      token: 't',
      store: env.SNAPSHOTS,
      fetch: github().fetch,
      now: at('2026-10-22T14:07:00Z'),
    });
    const body = (await (await githubResponse(env.SNAPSHOTS, 'bhoomi')).json()) as Served;
    expect(body.snapshot.days).toHaveLength(3);
  });
});
