import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { env } from 'cloudflare:workers';
import { githubLogin } from '../../lib/github';
import { PROFILE_ID } from '../../lib/site';
import { githubResponse } from '../../workers/github-sync';

// Runs on the Worker: her GitHub snapshot as the hourly sync last stored it.
export const prerender = false;

export const GET: APIRoute = async () => {
  const profile = await getEntry('profile', PROFILE_ID);
  return githubResponse(env.SNAPSHOTS, githubLogin(profile?.data.links.github));
};
