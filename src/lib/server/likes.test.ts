import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FLAGS_KEY } from './flags';
import { TURNSTILE_TEST_SECRET, VISITOR_COOKIE, type Platform } from './guard';
import { likesApi } from './likes';
import { platformFrom } from './platform';
import { localBindings, type LocalBindings } from './testing';

// Worker integration tests for /api/likes/<target> on real local bindings, with Cloudflare's
// always-pass Turnstile test secret (any token passes, no network).
let env: LocalBindings;
let dispose: () => Promise<void>;
let platform: Platform;
const api = likesApi(new Set(['smartblog-ai', 'reel-latency', 'wearduds']));
const ORIGIN = 'https://bhoomi.example';
let n = 0;

beforeAll(async () => {
  const local = await localBindings();
  env = local.env;
  dispose = local.dispose;
  platform = platformFrom({ ...env, TURNSTILE_SECRET: TURNSTILE_TEST_SECRET });
}, 120_000);

afterAll(async () => dispose?.());
beforeEach(async () => env.FLAGS.put(FLAGS_KEY, '{}'));

function request(method: string, cookie?: string, body: unknown = { turnstile: 'token' }) {
  const headers = new Headers({
    Origin: ORIGIN,
    'Content-Type': 'application/json',
    'CF-Connecting-IP': `198.51.100.${++n}`,
  });
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`${ORIGIN}/api/likes/x`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

const cookieOf = (res: Response) => (res.headers.get('Set-Cookie') ?? '').split(';')[0];

describe('/api/likes/<target>', () => {
  it('a like is counted once per visitor, and unliking takes it back', async () => {
    let res = await api.get(request('GET'), 'smartblog-ai', platform);
    expect(await res.json()).toEqual({ ok: true, liked: false, count: 0 });

    res = await api.post(request('POST'), 'smartblog-ai', platform);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, liked: true, count: 1 });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(new RegExp(`^${VISITOR_COOKIE}=`));

    // Liking again changes nothing; the visitor's GET now says they liked it.
    res = await api.post(request('POST', cookie), 'smartblog-ai', platform);
    expect(await res.json()).toEqual({ ok: true, liked: true, count: 1 });
    res = await api.get(request('GET', cookie), 'smartblog-ai', platform);
    expect(await res.json()).toEqual({ ok: true, liked: true, count: 1 });
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    // Someone else's like adds to the count; unliking twice is harmless.
    await api.post(request('POST'), 'smartblog-ai', platform);
    res = await api.delete(request('DELETE', cookie), 'smartblog-ai', platform);
    expect(await res.json()).toEqual({ ok: true, liked: false, count: 1 });
    res = await api.delete(request('DELETE', cookie), 'smartblog-ai', platform);
    expect(await res.json()).toEqual({ ok: true, liked: false, count: 1 });
  });

  it('reels are liked as reel-<id>, separately from posts', async () => {
    const res = await api.post(request('POST'), 'reel-latency', platform);
    expect(await res.json()).toMatchObject({ liked: true, count: 1 });
    expect(await platform.repo.likes.count('latency')).toBe(0);
  });

  it('only real posts and reels can be liked or read', async () => {
    for (const target of ['nope', 'reel-nope', undefined, "x'; DROP TABLE likes;--"]) {
      expect((await api.get(request('GET'), target, platform)).status).toBe(404);
      expect((await api.post(request('POST'), target, platform)).status).toBe(404);
      expect((await api.delete(request('DELETE'), target, platform)).status).toBe(404);
    }
  });

  it('the off switch stops reads and writes alike', async () => {
    await env.FLAGS.put(FLAGS_KEY, '{"likes":false}');
    expect((await api.get(request('GET'), 'wearduds', platform)).status).toBe(503);
    expect((await api.post(request('POST'), 'wearduds', platform)).status).toBe(503);
    expect(await platform.repo.likes.count('wearduds')).toBe(0);
  });

  it('writes need a Turnstile token and must come from the site', async () => {
    let res = await api.post(request('POST', undefined, {}), 'wearduds', platform);
    expect(res.status).toBe(403);
    const crossSite = new Request(`${ORIGIN}/api/likes/wearduds`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstile: 't' }),
    });
    res = await api.post(crossSite, 'wearduds', platform);
    expect(res.status).toBe(403);
    expect(await platform.repo.likes.count('wearduds')).toBe(0);
  });
});
