import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readFlags } from '../../lib/server/flags';

// Runs on the Worker for every request (the rest of the site is prerendered).
export const prerender = false;

/**
 * Liveness check for deploy smoke tests: which live features are switched on, and whether the
 * database answers. A database that doesn't answer makes this a 503, so a deploy fails loudly.
 */
export const GET: APIRoute = async () => {
  const flags = await readFlags(env.FLAGS);
  const db = await env.DB.prepare('SELECT 1 AS ok')
    .first<{ ok: number }>()
    .then((row) => row?.ok === 1)
    .catch(() => false);
  return Response.json(
    { ok: db, flags, db },
    { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
};
