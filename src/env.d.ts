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
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
