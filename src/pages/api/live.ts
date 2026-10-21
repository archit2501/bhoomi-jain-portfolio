import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readFlags } from '../../lib/server/flags';

// The live room (task 3.2.2): a WebSocket to the Presence Durable Object, one room for the site.
// With the `presence` switch off, or no WebSocket upgrade, nothing connects and the page stays
// static.
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected a WebSocket', { status: 426 });
  }
  if (!(await readFlags(env.FLAGS)).presence || !env.PRESENCE) {
    return new Response('off', { status: 503 });
  }
  return env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch(request);
};
