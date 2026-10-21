import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { platformFrom } from '../../../lib/server/platform';
import { dms } from './_api';

// Runs on the Worker: a new conversation with Bhoomi.
export const prerender = false;

export const POST: APIRoute = async ({ request }) =>
  (await dms()).start(request, platformFrom(env));
