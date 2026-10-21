import Anthropic from '@anthropic-ai/sdk';
import type { APIRoute } from 'astro';
import { getCollection, getEntry } from 'astro:content';
import { env } from 'cloudflare:workers';
import { aiApi } from '../../lib/server/ai';
import { aiDocuments, systemPrompt } from '../../lib/server/ai-context';
import { platformFrom } from '../../lib/server/platform';
import { PROFILE_ID } from '../../lib/site';

// Runs on the Worker: "Ask my AI", answering from her résumé and posts.
export const prerender = false;

let api: Promise<ReturnType<typeof aiApi>> | undefined;

const assistant = () =>
  (api ??= Promise.all([
    getEntry('profile', PROFILE_ID),
    getEntry('resume', PROFILE_ID),
    getCollection('posts'),
  ]).then(([profile, resume, posts]) => {
    if (!profile || !resume) throw new Error(`profile and résumé "${PROFILE_ID}" are required`);
    // Grid order (pinned first), as on her profile: document order is part of the cache key.
    const grid = posts
      .map((p) => ({ id: p.id, data: p.data, body: p.body ?? '' }))
      .sort((a, b) => Number(b.data.pinned) - Number(a.data.pinned) || a.data.order - b.data.order);
    return aiApi({
      documents: aiDocuments(resume.data, grid),
      system: systemPrompt(profile.data.displayName),
      client: env.ANTHROPIC_API_KEY
        ? new Anthropic({
            apiKey: env.ANTHROPIC_API_KEY,
            baseURL: env.ANTHROPIC_BASE_URL || undefined,
            maxRetries: 1,
          })
        : null,
    });
  }));

export const GET: APIRoute = async () => (await assistant()).get(platformFrom(env));

export const POST: APIRoute = async ({ request }) =>
  (await assistant()).post(request, platformFrom(env));
