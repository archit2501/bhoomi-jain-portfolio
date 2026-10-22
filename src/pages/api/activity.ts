import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { activityResponse } from '../../lib/server/activity';
import { createRepo } from '../../lib/server/db';

// Runs on the Worker: the latest approved comments, for Notifications.
export const prerender = false;

export const GET: APIRoute = () => activityResponse(createRepo(env.DB));
