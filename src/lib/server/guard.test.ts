import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepo } from './db';
import { FLAGS_KEY } from './flags';
import {
  DAILY_CAPS,
  defineWrite,
  MAX_BODY_BYTES,
  sameSite,
  TURNSTILE_TEST_SECRET,
  underDailyCap,
  verifyTurnstile,
  visitorCookie,
  visitorFrom,
  VISITOR_COOKIE,
  type Platform,
} from './guard';
import { platformFrom } from './platform';
import { localBindings } from './testing';

// Worker integration tests: the whole write pipeline against the real local bindings from
// wrangler.jsonc (D1, both KV namespaces and both rate limiters). Only Turnstile is faked: it
// would need the network.
type Env = Awaited<ReturnType<typeof localBindings>>['env'];
let env: Env;
let dispose: () => Promise<void>;
let platform: Platform;
let turnstileOk = true;

beforeAll(async () => {
  const local = await localBindings();
  env = local.env;
  dispose = local.dispose;
}, 120_000);

afterAll(async () => dispose?.());

beforeEach(async () => {
  turnstileOk = true;
  await env.FLAGS.put(FLAGS_KEY, '{}');
  platform = { ...platformFrom(env), turnstile: async () => turnstileOk };
});

const ORIGIN = 'https://bhoomi.example';
let ipCounter = 0;
const freshIp = () => `203.0.113.${++ipCounter}`;
const freshVisitor = () => `visitor${String(++ipCounter).padStart(12, '0')}`;

function post(
  body: unknown,
  {
    ip = freshIp(),
    visitor,
    origin = ORIGIN,
    type = 'application/json',
  }: { ip?: string; visitor?: string; origin?: string | null; type?: string } = {},
) {
  const headers = new Headers({ 'Content-Type': type, 'CF-Connecting-IP': ip });
  if (origin) headers.set('Origin', origin);
  if (visitor) headers.set('Cookie', `theme=dark; ${VISITOR_COOKIE}=${visitor}`);
  return new Request(`${ORIGIN}/api/likes/smartblog-ai`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// A sample write, as a real endpoint would declare it: likes a post.
const like = defineWrite({
  flag: 'likes',
  kind: 'like',
  parse: (body) => (typeof body.slug === 'string' && /^[a-z0-9-]+$/.test(body.slug) ? body : null),
  run: async (input, { visitor, repo }) => {
    await repo.likes.add(input.slug as string, visitor);
    return Response.json({ ok: true, count: await repo.likes.count(input.slug as string) });
  },
});

describe('the write pipeline', () => {
  it('a good write goes through and gets an anonymous visitor cookie', async () => {
    const res = await like(post({ slug: 'p-good', turnstile: 'tok' }), platform);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(new RegExp(`^${VISITOR_COOKIE}=[A-Za-z0-9_-]{22}; Path=/;`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('a returning visitor keeps their id, so liking twice still counts once', async () => {
    const visitor = freshVisitor();
    await like(post({ slug: 'p-twice', turnstile: 't' }, { visitor }), platform);
    const res = await like(post({ slug: 'p-twice', turnstile: 't' }, { visitor }), platform);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('obeys its off switch before touching anything', async () => {
    await env.FLAGS.put(FLAGS_KEY, '{"likes":false}');
    const res = await like(post({ slug: 'p-off', turnstile: 't' }), platform);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'disabled' });
    expect(await platform.repo.likes.count('p-off')).toBe(0);
  });

  it('only this site may write: another origin, or no origin at all, is refused', async () => {
    for (const origin of ['https://evil.example', null]) {
      const res = await like(post({ slug: 'p', turnstile: 't' }, { origin }), platform);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'cross_site' });
    }
  });

  it('refuses anything but a small JSON object', async () => {
    const cases: [Request, number, string][] = [
      [post('slug=p', { type: 'application/x-www-form-urlencoded' }), 415, 'bad_request'],
      [post('{not json'), 400, 'bad_request'],
      [post('[1, 2]'), 400, 'bad_request'],
      [post({ pad: 'x'.repeat(MAX_BODY_BYTES), turnstile: 't' }), 413, 'too_large'],
    ];
    for (const [request, status, error] of cases) {
      const res = await like(request, platform);
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ error });
    }
  });

  it('a missing or bad Turnstile token is refused', async () => {
    let res = await like(post({ slug: 'p-bot' }), platform);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'turnstile_failed' });
    turnstileOk = false;
    res = await like(post({ slug: 'p-bot', turnstile: 'forged' }), platform);
    expect(res.status).toBe(403);
    expect(await platform.repo.likes.count('p-bot')).toBe(0);
  });

  it('invalid input is refused after the checks', async () => {
    const res = await like(post({ slug: 'Not A Slug!', turnstile: 't' }), platform);
    expect(res.status).toBe(400);
  });

  it('a visitor hits their limit (12 a minute) and gets told when to retry', async () => {
    const visitor = freshVisitor();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await like(post({ slug: 'p-rate', turnstile: 't' }, { visitor }), platform);
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.headers.get('Retry-After')).toBe('60');
        expect(await res.json()).toMatchObject({ error: 'rate_limited' });
      }
    }
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(12)).toEqual([429, 429]);
  }, 30_000);

  it('one IP hits its limit (30 a minute) even when it rotates visitor cookies', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) {
      const res = await like(
        post({ slug: 'p-ip', turnstile: 't' }, { ip, visitor: freshVisitor() }),
        platform,
      );
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.slice(30)).toEqual([429, 429]);
  }, 60_000);

  it("stops at today's site-wide cap", async () => {
    // A day no other test writes on.
    const now = Date.UTC(2031, 4, 1, 12);
    await env.COUNTERS.put('count:like:2031-05-01', String(DAILY_CAPS.like));
    const res = await like(post({ slug: 'p-cap', turnstile: 't' }), {
      ...platform,
      now: () => now,
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'daily_cap' });
  });
});

describe('daily caps', () => {
  it('counts writes per kind per UTC day, and a new day starts fresh', async () => {
    const day1 = Date.UTC(2026, 0, 1, 23, 59);
    const day2 = Date.UTC(2026, 0, 2, 0, 1);
    await env.COUNTERS.put('count:comment:2026-01-01', String(DAILY_CAPS.comment - 1));
    expect(await underDailyCap(env.COUNTERS, 'comment', day1)).toBe(true);
    expect(await underDailyCap(env.COUNTERS, 'comment', day1)).toBe(false);
    expect(await underDailyCap(env.COUNTERS, 'comment', day2)).toBe(true);
    expect(await env.COUNTERS.get('count:comment:2026-01-02')).toBe('1');
  });

  it('no counter store, or a broken one, never blocks a write', async () => {
    expect(await underDailyCap(undefined, 'dm', 0)).toBe(true);
    const broken = {
      get: () => Promise.reject(new Error('KV down')),
      put: () => Promise.resolve(),
    };
    expect(await underDailyCap(broken, 'dm', 0)).toBe(true);
  });
});

describe('verifyTurnstile', () => {
  const answer = (body: unknown, ok = true) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));

  it("asks Cloudflare with the secret, the token and the visitor's IP", async () => {
    const fetch = answer({ success: true });
    expect(await verifyTurnstile('tok', { secret: 's3cret', ip: '198.51.100.7', fetch })).toBe(
      true,
    );
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const form = init.body as FormData;
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual([
      's3cret',
      'tok',
      '198.51.100.7',
    ]);
  });

  it('fails closed', async () => {
    expect(await verifyTurnstile('tok', { secret: 's', fetch: answer({ success: false }) })).toBe(
      false,
    );
    expect(await verifyTurnstile('tok', { secret: 's', fetch: answer({}, false) })).toBe(false);
    expect(await verifyTurnstile('tok', { secret: 's', fetch: answer('nope') })).toBe(false);
    const offline = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(await verifyTurnstile('tok', { secret: 's', fetch: offline })).toBe(false);
    // No secret configured, no token, or an absurd one: refused without asking.
    const never = answer({ success: true });
    expect(await verifyTurnstile('tok', { secret: undefined, fetch: never })).toBe(false);
    expect(await verifyTurnstile('', { secret: 's', fetch: never })).toBe(false);
    expect(await verifyTurnstile('x'.repeat(2049), { secret: 's', fetch: never })).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it("Cloudflare's always-pass test secret passes any token without the network", async () => {
    const never = answer({ success: false });
    expect(await verifyTurnstile('any', { secret: TURNSTILE_TEST_SECRET, fetch: never })).toBe(
      true,
    );
    expect(await verifyTurnstile('', { secret: TURNSTILE_TEST_SECRET, fetch: never })).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it('the platform wires the secret from the Worker environment', async () => {
    const fetch = answer({ success: true });
    const wired = platformFrom({ ...env, TURNSTILE_SECRET: 'from-env' }, fetch);
    expect(await wired.turnstile('tok', '192.0.2.1')).toBe(true);
    const form = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get('secret')).toBe('from-env');
    const unset = platformFrom({ DB: env.DB }, fetch);
    expect(await unset.turnstile('tok', '192.0.2.1')).toBe(false);
  });
});

describe('visitor ids and origins', () => {
  it('reads only well-formed ids of ours from the cookie header', () => {
    expect(visitorFrom(`a=1; ${VISITOR_COOKIE}=abcdefghijklmnop_-12; b=2`)).toBe(
      'abcdefghijklmnop_-12',
    );
    expect(visitorFrom(`${VISITOR_COOKIE}=short`)).toBeNull();
    expect(visitorFrom(`${VISITOR_COOKIE}=<script>alert(1)</script>xxxxxx`)).toBeNull();
    expect(visitorFrom(null)).toBeNull();
    expect(visitorFrom('other=1')).toBeNull();
  });

  it('marks the cookie Secure only over HTTPS', () => {
    expect(visitorCookie('id', true)).toContain('; Secure');
    expect(visitorCookie('id', false)).not.toContain('Secure');
  });

  it('accepts same-origin fetch metadata when a browser sends no Origin', () => {
    const req = (headers: Record<string, string>) =>
      new Request(`${ORIGIN}/api/x`, { method: 'POST', headers });
    expect(sameSite(req({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
    expect(sameSite(req({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false);
    expect(sameSite(req({ Origin: ORIGIN }))).toBe(true);
  });
});

describe('repository wiring', () => {
  it('platformFrom gives handlers a working repository', async () => {
    const repo = createRepo(env.DB);
    await repo.polls.vote('wiring', 'v', 'yes');
    expect(await platformFrom(env).repo.polls.results('wiring')).toEqual({ yes: 1 });
  });
});
