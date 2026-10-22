/**
 * The Worker's entrypoint: Astro's request handler, the Presence Durable Object class that
 * wrangler.jsonc binds as PRESENCE (task 3.2.2), and the hourly Cron Trigger that syncs her
 * GitHub (task 4.2.1). The adapter uses this file because wrangler.jsonc names it as `main`.
 */
import { handle } from '@astrojs/cloudflare/handler';
import profiles from './content/profile.json';
import { githubLogin } from './lib/github';
import { PROFILE_ID } from './lib/site';
import { syncGithub } from './workers/github-sync';

export { Presence } from './workers/presence';

const profile = (profiles as Record<string, { links?: { github?: string } }>)[PROFILE_ID];

export default {
  fetch: handle,
  scheduled(
    _controller: unknown,
    env: Cloudflare.Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    ctx.waitUntil(
      syncGithub({
        login: githubLogin(profile?.links?.github),
        token: env.GITHUB_TOKEN,
        store: env.SNAPSHOTS,
      }),
    );
  },
};
