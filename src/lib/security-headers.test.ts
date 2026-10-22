import { describe, expect, it } from 'vitest';
import {
  BASE_HEADERS,
  headersRule,
  pageCsp,
  PERMISSIONS_POLICY,
  TURNSTILE_ORIGIN,
  withSecurityHeaders,
  WORKER_CSP,
} from './security-headers';

const HASH = 'sha256-abc=';

describe('pageCsp', () => {
  const csp = pageCsp([HASH]);

  it('runs scripts from the site, Turnstile and listed hashes, never any other inline script', () => {
    expect(csp).toContain(`script-src 'self' '${HASH}' ${TURNSTILE_ORIGIN};`);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain(`frame-src ${TURNSTILE_ORIGIN};`);
  });

  it('keeps every other kind of resource on the site and refuses to be framed', () => {
    for (const directive of [
      "default-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "worker-src 'self'",
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
    ]) {
      expect(csp).toContain(`${directive};`);
    }
    expect(csp.endsWith("frame-ancestors 'none'")).toBe(true);
  });
});

describe('the base headers', () => {
  it('turn off the features the site never uses', () => {
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(PERMISSIONS_POLICY).toContain(`${feature}=()`);
    }
    expect(BASE_HEADERS).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
  });
});

describe('headersRule', () => {
  it('covers every static file with the base headers and the page policy', () => {
    const rule = headersRule({ scriptHashes: [HASH], preview: false });
    const lines = rule.split('\n');
    expect(lines).toContain('/*');
    expect(lines).toContain('  X-Content-Type-Options: nosniff');
    expect(lines).toContain(`  Content-Security-Policy: ${pageCsp([HASH])}`);
    expect(rule).not.toContain('X-Robots-Tag');
  });

  it('tells search engines to stay away from a preview build', () => {
    expect(headersRule({ scriptHashes: [], preview: true })).toContain(
      '  X-Robots-Tag: noindex, nofollow',
    );
  });
});

describe('withSecurityHeaders', () => {
  it('adds the headers and the locked-down policy to what the Worker renders', () => {
    const res = withSecurityHeaders(Response.json({ ok: true }), { preview: false });
    expect(res.headers.get('Content-Security-Policy')).toBe(WORKER_CSP);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Permissions-Policy')).toBe(PERMISSIONS_POLICY);
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
    expect(WORKER_CSP).toMatch(/^default-src 'none';/);
  });

  it('keeps the status, the body and headers the response set itself', async () => {
    const page = new Response('<p>hi</p>', {
      status: 404,
      headers: { 'Content-Security-Policy': pageCsp([]), 'Referrer-Policy': 'same-origin' },
    });
    const res = withSecurityHeaders(page, { preview: false });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('<p>hi</p>');
    expect(res.headers.get('Content-Security-Policy')).toBe(pageCsp([]));
    expect(res.headers.get('Referrer-Policy')).toBe('same-origin');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('says noindex on the preview Worker', () => {
    const res = withSecurityHeaders(new Response('ok'), { preview: true });
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('returns a response that already has every header as it is', () => {
    const first = withSecurityHeaders(new Response('ok'), { preview: false });
    expect(withSecurityHeaders(first, { preview: false })).toBe(first);
  });

  it('leaves a WebSocket upgrade alone', () => {
    const upgrade = { status: 101, headers: new Headers() } as Response;
    expect(withSecurityHeaders(upgrade, { preview: true })).toBe(upgrade);
  });
});
