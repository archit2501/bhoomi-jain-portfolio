import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dmApi, parseStart, type Topic } from './dms';
import { FLAGS_KEY } from './flags';
import { TURNSTILE_TEST_SECRET, type Platform } from './guard';
import type { Notice } from './notify';
import { platformFrom } from './platform';
import { checkReply, REPLY_TTL_MS } from './sign';
import { localBindings, type LocalBindings } from './testing';

// Worker integration tests: a conversation with Bhoomi, end to end, on real local bindings.
let env: LocalBindings;
let dispose: () => Promise<void>;
let platform: Platform;
let notices: Notice[];
let clock: number;
const SECRET = 'reply-secret-for-tests';
const ORIGIN = 'https://bhoomi.example';
let n = 0;

const topics = new Map<string, Topic>([
  ['hire', { label: 'Hire me', ai: false }],
  ['hello', { label: 'Just say hi', ai: false }],
  ['ask-ai', { label: 'Ask my AI', ai: true }],
]);
const api = dmApi({
  topics,
  notify: async (notice) => (notices.push(notice), true),
  secret: SECRET,
  now: () => clock,
});

beforeAll(async () => {
  const local = await localBindings();
  env = local.env;
  dispose = local.dispose;
  platform = platformFrom({ ...env, TURNSTILE_SECRET: TURNSTILE_TEST_SECRET });
}, 120_000);

afterAll(async () => dispose?.());
beforeEach(async () => {
  notices = [];
  clock = Date.UTC(2026, 9, 22, 10);
  await env.FLAGS.put(FLAGS_KEY, '{}');
});

const json = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `198.51.100.${++n}`,
      ...headers,
    },
    body: JSON.stringify({ turnstile: 'token', ...(body as object) }),
  });

const read = (id: string, secret: string) =>
  api.read(
    new Request(`${ORIGIN}/api/dm/${id}`, { headers: { 'X-Thread-Secret': secret } }),
    id,
    platform,
  );

async function startThread(body = 'Are you open to frontend roles?') {
  const res = await api.start(
    json('/api/dm', { topic: 'hire', name: 'Priya', email: 'priya@example.com', body }),
    platform,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; secret: string };
}

/** Bhoomi's link, followed: the GET page, then the reply form's POST. */
async function bhoomiReplies(link: string, body: string) {
  const review = await api.review(new Request(link), platform);
  const reply = await api.reply(
    new Request(`${ORIGIN}/api/dm/reply`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...Object.fromEntries(new URL(link).searchParams),
        body,
      }).toString(),
    }),
    platform,
  );
  return { review, reply };
}

describe('a conversation with Bhoomi', () => {
  it('a message starts a private thread and reaches her with a reply link', async () => {
    const { id, secret } = await startThread();
    expect(secret.length).toBeGreaterThanOrEqual(32);

    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('New message: Hire me');
    expect(notices[0].lines).toContain('From Priya <priya@example.com>:');
    expect(notices[0].lines).toContain('Are you open to frontend roles?');
    const link = notices[0].links![0].url;
    expect(link).toMatch(/^https:\/\/bhoomi\.example\/api\/dm\/reply\?id=/);

    const thread = await (await read(id, secret)).json();
    expect(thread.thread).toMatchObject({ topic: 'hire', label: 'Hire me' });
    expect(thread.thread.messages.map((m: { sender: string }) => m.sender)).toEqual(['visitor']);
    // Nobody else's address or email comes back to the visitor.
    expect(JSON.stringify(thread)).not.toContain('priya@example.com');
  });

  it('her reply shows on the visitor’s private link; the page alone decides nothing', async () => {
    const { id, secret } = await startThread('Hello!');
    const link = notices[0].links![0].url;
    const { review, reply } = await bhoomiReplies(link, 'Thanks Priya, let’s talk.');
    const html = await review.text();
    expect(html).toContain('Hire me: Priya');
    expect(html).toContain('mailto:priya@example.com');
    expect(html).toContain('<textarea');
    expect(await reply.text()).toContain('Reply sent');

    const { thread } = await (await read(id, secret)).json();
    expect(
      thread.messages.map((m: { sender: string; body: string }) => [m.sender, m.body]),
    ).toEqual([
      ['visitor', 'Hello!'],
      ['bhoomi', 'Thanks Priya, let’s talk.'],
    ]);
  });

  it('the visitor can write again on the same thread, and she is told', async () => {
    const { id, secret } = await startThread('First');
    notices = [];
    const res = await api.follow(json(`/api/dm/${id}`, { secret, body: 'Second' }), id, platform);
    expect(res.status).toBe(201);
    expect(notices[0].lines).toEqual([
      'From Priya:',
      'Second',
      '',
      'The reply link works for 30 days.',
    ]);
    const { thread } = await (await read(id, secret)).json();
    expect(thread.messages.map((m: { body: string }) => m.body)).toEqual(['First', 'Second']);
  });

  it('a thread stays private: a wrong secret or id gets a plain 404', async () => {
    const { id, secret } = await startThread();
    expect((await read(id, 'not-the-secret')).status).toBe(404);
    expect((await read('not-the-id', secret)).status).toBe(404);
    expect((await read(id, '')).status).toBe(404);
    const res = await api.follow(
      json(`/api/dm/${id}`, { secret: 'guess', body: 'x' }),
      id,
      platform,
    );
    expect(res.status).toBe(404);
    expect((await api.follow(json('/api/dm/x', { body: 'x' }), undefined, platform)).status).toBe(
      404,
    );
  });

  it('reply links expire after 30 days and can’t be forged or replayed elsewhere', async () => {
    await startThread();
    const link = notices[0].links![0].url;
    const forged = new URL(link);
    forged.searchParams.set('id', 'another-thread');
    expect((await api.review(new Request(forged), platform)).status).toBe(400);
    const empty = await bhoomiReplies(link, '   ');
    expect(empty.reply.status).toBe(400);
    clock += REPLY_TTL_MS + 1;
    const { review, reply } = await bhoomiReplies(link, 'Too late');
    expect(review.status).toBe(410);
    expect(reply.status).toBe(410);
    const crossSite = await api.reply(
      new Request(`${ORIGIN}/api/dm/reply`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
      platform,
    );
    expect(crossSite.status).toBe(403);
  });

  it('the off switch stops new messages; reading and replying go on', async () => {
    const { id, secret } = await startThread();
    await env.FLAGS.put(FLAGS_KEY, '{"dms":false}');
    const res = await api.start(
      json('/api/dm', { topic: 'hello', name: 'A', body: 'Hi' }),
      platform,
    );
    expect(res.status).toBe(503);
    expect((await read(id, secret)).status).toBe(200);
  });

  it('without a reply secret, messages wait in the database and nobody is told', async () => {
    const quiet = dmApi({
      topics,
      notify: async (x) => (notices.push(x), true),
      secret: undefined,
    });
    const res = await quiet.start(
      json('/api/dm', { topic: 'hello', name: 'A', body: 'Hi' }),
      platform,
    );
    expect(res.status).toBe(201);
    expect(notices).toEqual([]);
    expect((await checkReply(new URLSearchParams('id=x&exp=1&sig=y'), undefined, 0)).result).toBe(
      'invalid',
    );
  });
});

describe('parseStart', () => {
  it('takes a human topic, a name, an optional email and a message', () => {
    expect(
      parseStart({ topic: 'hire', name: ' Priya  S ', body: ' Hi\n\n\n\nthere ' }, topics),
    ).toEqual({
      topic: 'hire',
      name: 'Priya S',
      email: null,
      body: 'Hi\n\nthere',
    });
    expect(
      parseStart({ topic: 'hire', name: 'P', email: 'p@x.io', body: 'Hi' }, topics)?.email,
    ).toBe('p@x.io');
  });

  it('refuses the AI thread, unknown topics, bad emails and empty or huge messages', () => {
    for (const fields of [
      { topic: 'ask-ai', name: 'P', body: 'Hi' },
      { topic: 'spam', name: 'P', body: 'Hi' },
      { topic: 'hire', name: '', body: 'Hi' },
      { topic: 'hire', name: 'P', email: 'not-an-email', body: 'Hi' },
      { topic: 'hire', name: 'P', body: '' },
      { topic: 'hire', name: 'P', body: 'x'.repeat(2001) },
    ]) {
      expect(parseStart(fields, topics)).toBeNull();
    }
  });
});
