import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { platformFrom } from '../../../lib/server/platform';
import { dms } from './_api';

// Bhoomi's reply links land here: GET shows the conversation and a reply box, POST sends.
export const prerender = false;

export const GET: APIRoute = async ({ request }) =>
  (await dms()).review(request, platformFrom(env));
export const POST: APIRoute = async ({ request }) =>
  (await dms()).reply(request, platformFrom(env));
