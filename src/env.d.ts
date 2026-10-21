/**
 * Worker bindings, typed by hand for only what the server code uses.
 *
 * `wrangler types` would generate the full Workers runtime types, but those redeclare DOM globals
 * (for example `Element.append` from HTMLRewriter) and break the browser scripts in src/scripts,
 * which share this TypeScript project. Keep this file in step with wrangler.jsonc.
 */

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

declare namespace Cloudflare {
  interface Env {
    /** Off switches for the live features (src/lib/server/flags.ts). */
    FLAGS: KVNamespace;
    /** Daily write counters (src/lib/server/guard.ts). */
    COUNTERS: KVNamespace;
    /** Likes, comments, DMs, votes and answers (migrations/, src/lib/server/db.ts). */
    DB: import('./lib/server/db').D1Like;
    WRITE_LIMIT_IP: import('./lib/server/guard').RateLimiter;
    WRITE_LIMIT_VISITOR: import('./lib/server/guard').RateLimiter;
    /** Secrets, set with `wrangler secret put <NAME>` (docs/runbook.md). */
    TURNSTILE_SECRET?: string;
    APPROVAL_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    NOTIFY_WEBHOOK_URL?: string;
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
