import { describe, expect, it } from 'vitest';
import { CHECKS, smoke } from '../scripts/smoke.mjs';

const TYPES: Record<string, string> = {
  'text/html': 'text/html; charset=utf-8',
  xml: 'application/xml',
  'image/png': 'image/png',
  json: 'application/json',
  vcard: 'text/x-vcard',
  javascript: 'text/javascript',
};
const health = (flags: Record<string, boolean>, db = true) => ({ ok: db, db, flags });

/** A fake site; an override makes a fresh response for every request to its path. */
function site(overrides: Record<string, () => Response> = {}) {
  const seen: string[] = [];
  const fetch = (async (url: URL) => {
    seen.push(url.pathname);
    const custom = overrides[url.pathname];
    if (custom) return custom();
    const check = CHECKS.find((c) => c.path === url.pathname)!;
    if (url.pathname === '/api/health') {
      return Response.json(health({ likes: true, comments: true }));
    }
    return new Response('ok', { headers: { 'Content-Type': TYPES[check.type] } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}
const quiet = { retries: 2, delayMs: 0, log: () => {} };

describe('the production smoke test', () => {
  it('passes when every page, file and the API answer, with every switch on', async () => {
    const { fetch, seen } = site();
    expect(await smoke('https://bhoomi.example', { ...quiet, fetch })).toEqual([]);
    expect(seen).toEqual(CHECKS.map((c) => c.path));
  });

  it('names what failed: a status, a wrong type, a switch off, the database down', async () => {
    const { fetch } = site({
      '/reels/': () => new Response('no', { status: 502 }),
      '/manifest.webmanifest': () =>
        new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
      '/api/health': () => Response.json(health({ likes: true, ai_chat: false })),
    });
    expect(await smoke('https://bhoomi.example', { ...quiet, fetch })).toEqual([
      '/reels/ answered 502',
      '/manifest.webmanifest is text/html, not json',
      '/api/health switched off: ai_chat',
    ]);
    const down = site({ '/api/health': () => Response.json(health({ likes: true }, false)) });
    expect(await smoke('https://bhoomi.example', { ...quiet, fetch: down.fetch })).toEqual([
      '/api/health the database does not answer',
    ]);
  });

  it('retries the first page while a deploy settles', async () => {
    let tries = 0;
    const { fetch } = site();
    const settling = (async (url: URL, init: RequestInit) => {
      if (url.pathname === '/' && ++tries < 3) throw new Error('connection refused');
      return fetch(url, init);
    }) as unknown as typeof globalThis.fetch;
    expect(await smoke('https://bhoomi.example', { ...quiet, fetch: settling })).toEqual([]);
    expect(tries).toBe(3);
  });
});
