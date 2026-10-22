import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commentsApi } from './comments';
import { dmApi } from './dms';
import { DEFAULT_FLAGS, FLAG_NAMES, FLAGS_KEY } from './flags';
import { TURNSTILE_TEST_SECRET, type Platform } from './guard';
import { likesApi } from './likes';
import { platformFrom } from './platform';
import { pollsApi } from './polls';
import { localBindings, type LocalBindings } from './testing';

// The kill-switch drill (task 5.2.1), on real local bindings: with every switch off, every
// write is refused with "disabled" and changes nothing; switched back on, they all work again.
// The production drill is the same with `--remote` (docs/runbook.md, Off switches).

const ORIGIN = 'https://bhoomi.example';
let env: LocalBindings;
let dispose: () => Promise<void>;
let platform: Platform;
let ip = 0;

const likes = likesApi(new Set(['smartblog-ai']));
const comments = commentsApi({
  posts: new Set(['smartblog-ai']),
  notify: async () => true,
  secret: 'drill-secret',
});
const dms = dmApi({
  topics: new Map([['hello', { label: 'Just say hi', ai: false }]]),
  notify: async () => true,
  secret: 'drill-secret',
});
const polls = pollsApi({
  stickers: new Map([['drill-poll', { kind: 'poll', options: 2, prompt: 'Which?' }]]),
  broadcast: async () => {},
  notify: async () => true,
});

const post = (path: string, body: Record<string, unknown>) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `198.51.100.${++ip}`,
    },
    body: JSON.stringify({ turnstile: 'token', ...body }),
  });

/** Every write the site takes, as its endpoint would receive it. */
const writes = () =>
  [
    ['like', likes.post(post('/api/likes/smartblog-ai', {}), 'smartblog-ai', platform)],
    [
      'comment',
      comments.create(
        post('/api/comments/smartblog-ai', { name: 'Drill', body: 'A drill comment' }),
        'smartblog-ai',
        platform,
      ),
    ],
    [
      'message',
      dms.start(post('/api/dm', { topic: 'hello', name: 'Drill', body: 'Hi' }), platform),
    ],
    ['vote', polls.post(post('/api/polls/drill-poll', { choice: 0 }), 'drill-poll', platform)],
  ] as const;

beforeAll(async () => {
  const local = await localBindings();
  env = local.env;
  dispose = local.dispose;
  platform = platformFrom({ ...env, TURNSTILE_SECRET: TURNSTILE_TEST_SECRET });
}, 120_000);
afterAll(async () => dispose?.());

describe('the kill-switch drill', () => {
  it('every switch off: every write is refused as "disabled", and nothing is stored', async () => {
    await env.FLAGS.put(
      FLAGS_KEY,
      JSON.stringify(Object.fromEntries(FLAG_NAMES.map((f) => [f, false]))),
    );
    const before = await env.DB.prepare(
      'SELECT (SELECT count(*) FROM likes) + (SELECT count(*) FROM comments) + (SELECT count(*) FROM dm_threads) + (SELECT count(*) FROM poll_votes) AS n',
    ).first<{ n: number }>();
    for (const [what, pending] of writes()) {
      const res = await pending;
      expect([what, res.status]).toEqual([what, 503]);
      expect(await res.json()).toMatchObject({ ok: false, error: 'disabled' });
    }
    const after = await env.DB.prepare(
      'SELECT (SELECT count(*) FROM likes) + (SELECT count(*) FROM comments) + (SELECT count(*) FROM dm_threads) + (SELECT count(*) FROM poll_votes) AS n',
    ).first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
    // Reading stays honest: comments say they're off rather than show an empty list.
    expect((await comments.list('smartblog-ai', platform)).status).toBe(503);
  });

  it('every switch back on (the stored object removed): every write works again', async () => {
    await env.FLAGS.put(FLAGS_KEY, '{}');
    expect(Object.values(DEFAULT_FLAGS).every(Boolean)).toBe(true);
    for (const [what, pending] of writes()) {
      const res = await pending;
      expect([what, res.ok]).toEqual([what, true]);
    }
  });
});
