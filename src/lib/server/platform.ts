/**
 * Builds the guard's Platform from the Worker's bindings (wrangler.jsonc). Endpoints call this;
 * tests build a Platform from local bindings instead.
 */
import { createRepo, type D1Like } from './db';
import type { FlagStore } from './flags';
import { verifyTurnstile, type CounterStore, type Platform, type RateLimiter } from './guard';

export interface WorkerBindings {
  DB: D1Like;
  FLAGS?: FlagStore;
  COUNTERS?: CounterStore;
  WRITE_LIMIT_IP?: RateLimiter;
  WRITE_LIMIT_VISITOR?: RateLimiter;
  /** Turnstile's secret key; without it every write is refused (fail closed). */
  TURNSTILE_SECRET?: string;
}

export function platformFrom(env: WorkerBindings, fetchImpl?: typeof fetch): Platform {
  return {
    flags: env.FLAGS,
    counters: env.COUNTERS,
    limits: { ip: env.WRITE_LIMIT_IP, visitor: env.WRITE_LIMIT_VISITOR },
    turnstile: (token, ip) =>
      verifyTurnstile(token, { secret: env.TURNSTILE_SECRET, ip, fetch: fetchImpl }),
    repo: createRepo(env.DB),
  };
}
