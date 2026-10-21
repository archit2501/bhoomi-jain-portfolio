import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { commentsApi } from '../../../lib/server/comments';
import { notifyBhoomi } from '../../../lib/server/notify';
import { platformFrom } from '../../../lib/server/platform';

// Bhoomi's approve and reject links land here: GET shows the comment and one button, POST decides.
export const prerender = false;

const api = () =>
  commentsApi({
    posts: new Set(),
    notify: (notice) => notifyBhoomi(notice, env),
    secret: env.APPROVAL_SECRET,
  });

export const GET: APIRoute = ({ request }) => api().review(request, platformFrom(env));
export const POST: APIRoute = ({ request }) => api().decide(request, platformFrom(env));
