/**
 * The Worker's entrypoint: Astro's request handler, plus the Presence Durable Object class that
 * wrangler.jsonc binds as PRESENCE (task 3.2.2). The adapter uses this file because wrangler.jsonc
 * names it as `main`.
 */
import { handle } from '@astrojs/cloudflare/handler';

export { Presence } from './workers/presence';

export default { fetch: handle };
