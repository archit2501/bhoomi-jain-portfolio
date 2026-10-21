import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { platformFrom } from '../../../lib/server/platform';
import { dms } from './_api';

// Runs on the Worker: one private conversation, for whoever holds its secret.
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) =>
  (await dms()).read(request, params.id, platformFrom(env));

export const POST: APIRoute = async ({ params, request }) =>
  (await dms()).follow(request, params.id, platformFrom(env));
