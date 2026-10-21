import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import { likesApi } from '../../../lib/server/likes';
import { platformFrom } from '../../../lib/server/platform';

// Runs on the Worker: likes are live data.
export const prerender = false;

// The things that can be liked: every post, and every reel as "reel-<id>". Built once per isolate.
let api: Promise<ReturnType<typeof likesApi>> | undefined;
const likes = () =>
  (api ??= Promise.all([getCollection('posts'), getCollection('reels')]).then(([posts, reels]) =>
    likesApi(new Set([...posts.map((p) => p.id), ...reels.map((r) => `reel-${r.id}`)])),
  ));

export const GET: APIRoute = async ({ params, request }) =>
  (await likes()).get(request, params.slug, platformFrom(env));

export const POST: APIRoute = async ({ params, request }) =>
  (await likes()).post(request, params.slug, platformFrom(env));

export const DELETE: APIRoute = async ({ params, request }) =>
  (await likes()).delete(request, params.slug, platformFrom(env));
