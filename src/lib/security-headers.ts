/**
 * Security headers (task 6.4.1), in one place for both ways a response leaves the site:
 * - the prerendered pages and every other static file, through Workers Static Assets, which reads
 *   them from dist/client/_headers (written after the build by src/integrations/security-headers.ts);
 * - what the Worker renders itself (/api/*, the approve and reply pages), through
 *   withSecurityHeaders in src/worker.ts.
 *
 * Preview builds (CLOUDFLARE_ENV=preview) also tell search engines to stay away: the preview
 * Worker serves the same pages as production on another address.
 */
/** Cloudflare Turnstile's script and its challenge frame (src/scripts/turnstile.ts). */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Browser features the site never asks for, switched off for it and anything it frames. Only names
 * Chrome knows: an unknown one is logged as a console error on every page. Left alone: autoplay
 * (reels), fullscreen, web-share and clipboard-write (the share sheet).
 */
const DENIED_FEATURES = [
  'accelerometer',
  'browsing-topics',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'serial',
  'usb',
];

export const PERMISSIONS_POLICY = DENIED_FEATURES.map((feature) => `${feature}=()`).join(', ');

/** Sent with every response, static or rendered by the Worker. */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': PERMISSIONS_POLICY,
  // For browsers without CSP frame-ancestors; no page is meant to be framed anywhere.
  'X-Frame-Options': 'DENY',
};

/** Preview builds only: the same pages as production, kept out of search results. */
export const NOINDEX_HEADERS: Readonly<Record<string, string>> = {
  'X-Robots-Tag': 'noindex, nofollow',
};

function policy(directives: Record<string, readonly string[]>): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ');
}

/**
 * The pages' policy. Scripts run from the site itself, from Turnstile, and inline only when their
 * hash is listed (Astro inlines small scripts; the theme boot script is inline on purpose), so no
 * 'unsafe-inline' for scripts. Styles keep 'unsafe-inline': the pages carry over a thousand
 * style="" attributes (fields, tones, progress), which hashes can't cover.
 */
export function pageCsp(scriptHashes: readonly string[]): string {
  return policy({
    'default-src': ["'self'"],
    'script-src': ["'self'", ...scriptHashes.map((hash) => `'${hash}'`), TURNSTILE_ORIGIN],
    'style-src': ["'self'", "'unsafe-inline'"],
    // data: for the grain texture (an SVG in CSS) and one font subset inlined by the bundler.
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'"],
    // The API and the live room's WebSocket, both on this origin.
    'connect-src': ["'self'"],
    'frame-src': [TURNSTILE_ORIGIN],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  });
}

/**
 * What the Worker renders: JSON, and two small pages for Bhoomi (approve a comment, reply to a
 * DM) with one inline <style> and a form that posts back to the same address. Nothing else loads.
 */
export const WORKER_CSP = policy({
  'default-src': ["'none'"],
  'style-src': ["'unsafe-inline'"],
  'form-action': ["'self'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
});

/**
 * The rule appended to dist/client/_headers: every static response gets the base headers and the
 * page policy, previews also the noindex header.
 */
export function headersRule(options: {
  scriptHashes: readonly string[];
  preview: boolean;
}): string {
  const headers = {
    ...BASE_HEADERS,
    'Content-Security-Policy': pageCsp(options.scriptHashes),
    ...(options.preview ? NOINDEX_HEADERS : {}),
  };
  return [
    '# Security headers for every static response (src/lib/security-headers.ts).',
    '/*',
    ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`),
  ].join('\n');
}

/**
 * Adds the headers to a response the Worker rendered, keeping any it already has: the 404 page
 * comes from the static assets with the page policy on it. A WebSocket upgrade (101) passes as is.
 */
export function withSecurityHeaders(response: Response, options: { preview: boolean }): Response {
  if (response.status === 101) return response;
  const wanted = {
    ...BASE_HEADERS,
    'Content-Security-Policy': WORKER_CSP,
    ...(options.preview ? NOINDEX_HEADERS : {}),
  };
  const missing = Object.entries(wanted).filter(([name]) => !response.headers.has(name));
  if (!missing.length) return response;
  const secured = new Response(response.body, response);
  for (const [name, value] of missing) secured.headers.set(name, value);
  return secured;
}
