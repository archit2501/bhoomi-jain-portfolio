import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import { commentsApi } from '../../../lib/server/comments';
import { notifyBhoomi } from '../../../lib/server/notify';
import { platformFrom } from '../../../lib/server/platform';

// Runs on the Worker: comments are live data, held for Bhoomi's approval.
export const prerender = false;

let api: Promise<ReturnType<typeof commentsApi>> | undefined;
const comments = () =>
  (api ??= getCollection('posts').then((posts) =>
    commentsApi({
      posts: new Set(posts.map((p) => p.id)),
      notify: (notice) => notifyBhoomi(notice, env),
      secret: env.APPROVAL_SECRET,
    }),
  ));

export const GET: APIRoute = async ({ params }) =>
  (await comments()).list(params.post, platformFrom(env));

export const POST: APIRoute = async ({ params, request }) =>
  (await comments()).create(request, params.post, platformFrom(env));
