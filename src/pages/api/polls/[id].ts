import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import { notifyBhoomi } from '../../../lib/server/notify';
import { platformFrom } from '../../../lib/server/platform';
import { pollsApi, type LiveSticker } from '../../../lib/server/polls';
import { isLive } from '../../../lib/story/stickers';

// Runs on the Worker: answers to the story's poll, question box and emoji slider stickers.
export const prerender = false;

let api: Promise<ReturnType<typeof pollsApi>> | undefined;
const polls = () =>
  (api ??= getCollection('highlights').then((highlights) => {
    const stickers = new Map<string, LiveSticker>();
    for (const sticker of highlights.flatMap((h) => h.data.frames.flatMap((f) => f.stickers))) {
      if (!isLive(sticker)) continue;
      stickers.set(sticker.id, {
        kind: sticker.type,
        options: sticker.type === 'poll' ? sticker.options.length : undefined,
        prompt: sticker.type === 'poll' ? sticker.question : sticker.prompt,
      });
    }
    return pollsApi({
      stickers,
      broadcast: async (poll, results) => {
        if (!env.PRESENCE) return;
        await env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch(
          'https://presence/broadcast',
          { method: 'POST', body: JSON.stringify({ type: 'poll', poll, results }) },
        );
      },
      notify: (notice) => notifyBhoomi(notice, env),
    });
  }));

export const GET: APIRoute = async ({ params }) =>
  (await polls()).get(params.id, platformFrom(env));

export const POST: APIRoute = async ({ params, request }) =>
  (await polls()).post(request, params.id, platformFrom(env));
