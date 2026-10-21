/**
 * The live layer's protocol, kept free of Workers APIs so it is unit-tested: what a socket may
 * send, and what the Presence Durable Object broadcasts. Everything is small JSON.
 *
 *   server → client  {"type":"count","count":3}                     visitors on the site now
 *   server → client  {"type":"poll","poll":"next-writeup","results":{"a":4,"b":2}}
 *   client → server  {"type":"ping"}                                 keep-alive, answered by count
 */

export type ServerMessage =
  | { type: 'count'; count: number }
  | { type: 'poll'; poll: string; results: Record<string, number> };

export type ClientMessage = { type: 'ping' };

/** The most sockets one Durable Object accepts; beyond it, visitors simply don't count live. */
export const MAX_SOCKETS = 2000;

export function parseClient(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  try {
    const data = JSON.parse(raw) as { type?: unknown };
    return data && data.type === 'ping' ? { type: 'ping' } : null;
  } catch {
    return null;
  }
}

/** A poll update to broadcast, as the vote endpoint posts it to the Durable Object. */
export function parseBroadcast(raw: unknown): ServerMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { type?: unknown; poll?: unknown; results?: unknown };
  if (data.type !== 'poll' || typeof data.poll !== 'string' || !data.results) return null;
  if (typeof data.results !== 'object' || Array.isArray(data.results)) return null;
  const results: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.results as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) results[key] = value;
  }
  return { type: 'poll', poll: data.poll, results };
}

/** The client side's reading of a server message; anything unexpected is ignored. */
export function parseServer(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw) as { type?: unknown; count?: unknown };
    if (data.type === 'count' && typeof data.count === 'number' && data.count >= 0) {
      return { type: 'count', count: data.count };
    }
    return parseBroadcast(data);
  } catch {
    return null;
  }
}

/** "Active now · 3 here": the visitor counts themself, so it is never below 1 once connected. */
export function activeLabel(count: number): string {
  const n = Math.max(1, Math.floor(count));
  return n === 1 ? 'Active now · just you here' : `Active now · ${n} here`;
}
