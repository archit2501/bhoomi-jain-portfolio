import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readFlags } from '../../lib/server/flags';

// Runs on the Worker for every request (the rest of the site is prerendered).
export const prerender = false;

/** Liveness check for deploy smoke tests, plus which live features are switched on. */
export const GET: APIRoute = async () => {
  const flags = await readFlags(env.FLAGS);
  return Response.json({ ok: true, flags }, { headers: { 'Cache-Control': 'no-store' } });
};
