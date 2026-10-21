import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FLAGS_KEY } from './flags';
import { TURNSTILE_TEST_SECRET, VISITOR_COOKIE, type Platform } from './guard';
import type { Notice } from './notify';
import { platformFrom } from './platform';
import { pollsApi, type LiveSticker } from './polls';
import { localBindings, type LocalBindings } from './testing';

// Worker integration tests for the interactive stickers on real local bindings.
let env: LocalBindings;
let dispose: () => Promise<void>;
let platform: Platform;
let sent: { poll: string; results: Record<string, number> }[];
let notices: Notice[];
const ORIGIN = 'https://bhoomi.example';
let n = 0;

const stickers = new Map<string, LiveSticker>([
  ['next-writeup', { kind: 'poll', options: 2, prompt: 'Which next?' }],
  ['site-mood', { kind: 'slider', prompt: 'How is it?' }],
  ['ask-me', { kind: 'question', prompt: 'Ask me anything' }],
]);
const api = pollsApi({
  stickers,
  broadcast: async (poll, results) => void sent.push({ poll, results }),
  notify: async (notice) => (notices.push(notice), true),
});

beforeAll(async () => {
  const local = await localBindings();
  env = local.env;
  dispose = local.dispose;
  platform = platformFrom({ ...env, TURNSTILE_SECRET: TURNSTILE_TEST_SECRET });
}, 120_000);

afterAll(async () => dispose?.());
beforeEach(async () => {
  sent = [];
  notices = [];
  await env.FLAGS.put(FLAGS_KEY, '{}');
});

function post(body: unknown, cookie?: string) {
  const headers = new Headers({
    Origin: ORIGIN,
    'Content-Type': 'application/json',
    'CF-Connecting-IP': `192.0.2.${++n}`,
  });
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`${ORIGIN}/api/polls/x`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ turnstile: 'token', ...(body as object) }),
  });
}

describe('polls', () => {
  it('counts each visitor once, lets them change their vote, and broadcasts the results', async () => {
    let res = await api.post(post({ choice: 0 }), 'next-writeup', platform);
    expect(await res.json()).toEqual({ ok: true, mine: 0, results: { 0: 1, 1: 0 } });
    const cookie = (res.headers.get('Set-Cookie') ?? '').split(';')[0];
    expect(cookie).toMatch(new RegExp(`^${VISITOR_COOKIE}=`));

    await api.post(post({ choice: 1 }), 'next-writeup', platform);
    res = await api.post(post({ choice: 1 }, cookie), 'next-writeup', platform);
    expect(await res.json()).toEqual({ ok: true, mine: 1, results: { 0: 0, 1: 2 } });

    expect(sent.at(-1)).toEqual({ poll: 'next-writeup', results: { 0: 0, 1: 2 } });
    const read = await (await api.get('next-writeup', platform)).json();
    expect(read).toEqual({ ok: true, results: { 0: 0, 1: 2 } });
  });

  it('refuses a choice the poll does not have', async () => {
    for (const choice of [2, -1, 0.5, '0', null]) {
      expect((await api.post(post({ choice }), 'next-writeup', platform)).status).toBe(400);
    }
  });

  it('a broken live room never loses the vote', async () => {
    const shaky = pollsApi({
      stickers,
      broadcast: async () => Promise.reject(new Error('no room')),
      notify: async () => true,
    });
    expect((await shaky.post(post({ choice: 0 }), 'next-writeup', platform)).status).toBe(200);
  });
});

describe('emoji sliders', () => {
  it('averages each visitor’s 0-100 and is never broadcast as a poll', async () => {
    await api.post(post({ value: 100 }), 'site-mood', platform);
    const res = await api.post(post({ value: 50 }), 'site-mood', platform);
    expect(await res.json()).toEqual({ ok: true, mine: 50, results: { average: 75, count: 2 } });
    expect(sent).toEqual([]);
    for (const value of [101, -1, '50']) {
      expect((await api.post(post({ value }), 'site-mood', platform)).status).toBe(400);
    }
  });
});

describe('question box', () => {
  it('keeps answers for Bhoomi only and tells her', async () => {
    const res = await api.post(post({ body: 'What are you learning now?' }), 'ask-me', platform);
    expect(res.status).toBe(201);
    expect(notices).toEqual([
      { title: 'New answer to "Ask me anything"', lines: ['What are you learning now?'] },
    ]);
    expect((await api.get('ask-me', platform)).status).toBe(404);
    expect((await api.post(post({ body: '' }), 'ask-me', platform)).status).toBe(400);
  });
});

describe('all stickers', () => {
  it('only known stickers, and the off switch stops reads and writes', async () => {
    expect((await api.get('nope', platform)).status).toBe(404);
    expect((await api.post(post({ choice: 0 }), 'nope', platform)).status).toBe(404);
    expect((await api.get(undefined, platform)).status).toBe(404);
    await env.FLAGS.put(FLAGS_KEY, '{"polls":false}');
    expect((await api.get('next-writeup', platform)).status).toBe(503);
    expect((await api.post(post({ choice: 0 }), 'next-writeup', platform)).status).toBe(503);
  });
});
