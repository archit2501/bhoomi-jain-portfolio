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
    /** The live room: "Active now" and live poll results (src/workers/presence.ts). */
    PRESENCE: DurableObjectNamespace;
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
    /** "Ask my AI" (src/lib/server/ai.ts): off until it's set. */
    ANTHROPIC_API_KEY?: string;
    /** Only for tests: the e2e inbox stands in for the Claude API. */
    ANTHROPIC_BASE_URL?: string;
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;

  /** The part of the Durable Object API src/workers/presence.ts uses (WebSocket hibernation). */
  export interface DurableObjectState {
    acceptWebSocket(ws: WebSocket, tags?: string[]): void;
    getWebSockets(tag?: string): WebSocket[];
  }

  export abstract class DurableObject<E = Cloudflare.Env> {
    protected ctx: DurableObjectState;
    protected env: E;
    constructor(ctx: DurableObjectState, env: E);
  }
}

/** The Workers runtime's paired sockets: one end for the client, one kept by the server. */
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface ResponseInit {
  /** Workers: the client end of a WebSocketPair, on a 101 response. */
  webSocket?: WebSocket | null;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}
