import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createRepo } from '../../lib/server/db';
import { statsResponse } from '../../lib/server/stats';

// Runs on the Worker: this site's totals for Insights.
export const prerender = false;

export const GET: APIRoute = () => statsResponse(createRepo(env.DB));
