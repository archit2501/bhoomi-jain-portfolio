/**
 * Abuse protection for every write: one pipeline, so no endpoint can skip a step.
 *
 *   1. its feature flag is on (else 503, and nothing is touched);
 *   2. it comes from this site (Origin), as JSON, under 8 KB;
 *   3. the Turnstile token verifies;
 *   4. the per-IP and per-visitor rate limits (Cloudflare's Rate Limiting binding) allow it;
 *   5. today's site-wide cap for that kind of write isn't reached (a KV counter);
 *   6. the body passes the endpoint's own validation.
 *
 * Handlers get the visitor's anonymous id (a random cookie, set here on first write) and the
 * repository. Platform-agnostic: bindings come in through `Platform`, so tests pass real local
 * bindings (wrangler's platform proxy) or plain objects.
 */
import { readFlags, type FlagName, type FlagStore } from './flags';
import { randomToken, type Repo } from './db';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CounterStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Platform {
  flags: FlagStore | undefined;
  counters: CounterStore | undefined;
  limits: { ip: RateLimiter | undefined; visitor: RateLimiter | undefined };
  turnstile: (token: string, ip: string) => Promise<boolean>;
  repo: Repo;
  now?: () => number;
}

/** Site-wide writes allowed per UTC day, per kind: a ceiling no single abuser can push past. */
export const DAILY_CAPS = {
  like: 5000,
  comment: 200,
  dm: 100,
  vote: 2000,
  answer: 300,
} as const;
export type WriteKind = keyof typeof DAILY_CAPS;

export const MAX_BODY_BYTES = 8 * 1024;
export const VISITOR_COOKIE = 'bj_v';
const VISITOR_ID = /^[A-Za-z0-9_-]{16,64}$/;

export interface WriteContext {
  visitor: string;
  ip: string;
  repo: Repo;
}

export interface WriteSpec<T> {
  /** Required: a write that can't be switched off doesn't compile. */
  flag: FlagName;
  kind: WriteKind;
  /** Validates the JSON body (minus the Turnstile token); null rejects it with 400. */
  parse: (body: Record<string, unknown>) => T | null;
  run: (input: T, ctx: WriteContext) => Promise<Response>;
}

export type ErrorCode =
  | 'disabled'
  | 'cross_site'
  | 'bad_request'
  | 'too_large'
  | 'turnstile_failed'
  | 'rate_limited'
  | 'daily_cap';

export function errorResponse(code: ErrorCode, status: number, headers?: HeadersInit): Response {
  return Response.json(
    { ok: false, error: code },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

/** The visitor id from the cookie header, if it is one of ours. */
export function visitorFrom(cookieHeader: string | null): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === VISITOR_COOKIE) {
      const value = rest.join('=');
      return VISITOR_ID.test(value) ? value : null;
    }
  }
  return null;
}

export function visitorCookie(id: string, secure: boolean): string {
  return `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Writes must come from this site's own pages: a matching Origin, or same-origin fetch metadata. */
export function sameSite(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (origin) return origin === new URL(request.url).origin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Asks Cloudflare whether a Turnstile token is good. Fails closed: no secret, no token, a network
 * error or any answer but success is a "no".
 */
export async function verifyTurnstile(
  token: string,
  options: { secret: string | undefined; ip?: string; fetch?: typeof fetch },
): Promise<boolean> {
  if (!options.secret || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', options.secret);
  form.append('response', token);
  if (options.ip) form.append('remoteip', options.ip);
  try {
    const res = await (options.fetch ?? fetch)(SITEVERIFY, { method: 'POST', body: form });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Counts a write against today's cap. KV isn't atomic, so the cap is approximate, by design. */
export async function underDailyCap(
  counters: CounterStore | undefined,
  kind: WriteKind,
  now: number,
): Promise<boolean> {
  if (!counters) return true;
  const key = `count:${kind}:${day(now)}`;
  try {
    const used = Number(await counters.get(key)) || 0;
    if (used >= DAILY_CAPS[kind]) return false;
    await counters.put(key, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
    return true;
  } catch {
    // A counter outage shouldn't stop writes; the rate limits still apply.
    return true;
  }
}

/** Turns a spec into a request handler that runs the whole pipeline first. */
export function defineWrite<T>(spec: WriteSpec<T>) {
  return async (request: Request, platform: Platform): Promise<Response> => {
    const flags = await readFlags(platform.flags);
    if (!flags[spec.flag]) return errorResponse('disabled', 503);

    if (!sameSite(request)) return errorResponse('cross_site', 403);
    if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) {
      return errorResponse('bad_request', 415);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return errorResponse('too_large', 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return errorResponse('bad_request', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('bad_request', 400);
    }
    const { turnstile, ...fields } = body as Record<string, unknown>;

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (typeof turnstile !== 'string' || !(await platform.turnstile(turnstile, ip))) {
      return errorResponse('turnstile_failed', 403);
    }

    const known = visitorFrom(request.headers.get('Cookie'));
    const visitor = known ?? randomToken();
    const retry = { 'Retry-After': '60' };
    for (const [limiter, key] of [
      [platform.limits.ip, `ip:${ip}`],
      [platform.limits.visitor, `visitor:${visitor}`],
    ] as const) {
      if (limiter && !(await limiter.limit({ key })).success) {
        return errorResponse('rate_limited', 429, retry);
      }
    }
    if (!(await underDailyCap(platform.counters, spec.kind, (platform.now ?? Date.now)()))) {
      return errorResponse('daily_cap', 429, retry);
    }

    const input = spec.parse(fields);
    if (input === null) return errorResponse('bad_request', 400);

    const response = await spec.run(input, { visitor, ip, repo: platform.repo });
    if (!known) {
      const secure = new URL(request.url).protocol === 'https:';
      response.headers.append('Set-Cookie', visitorCookie(visitor, secure));
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
}
