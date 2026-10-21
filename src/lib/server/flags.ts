/**
 * Off switches for the live features. They live in the FLAGS KV namespace under one key, so
 * flipping one needs no redeploy (KV reads can lag up to about 60 seconds after a write):
 *
 *   npx wrangler kv key put --binding FLAGS --remote flags '{"ai_chat":false}'
 *
 * A feature is on unless the stored value turns it off. Anything unreadable falls back to the
 * defaults, so a bad write or a KV outage never takes the whole site down.
 */
export const FLAG_NAMES = ['ai_chat', 'comments', 'polls', 'dms'] as const;
export type FlagName = (typeof FLAG_NAMES)[number];
export type Flags = Readonly<Record<FlagName, boolean>>;

export const FLAGS_KEY = 'flags';
export const DEFAULT_FLAGS: Flags = { ai_chat: true, comments: true, polls: true, dms: true };

/** The part of a KV namespace this module needs, so tests can pass a plain object. */
export interface FlagStore {
  get(key: string): Promise<string | null>;
}

/** Reads the stored JSON over the defaults. Unknown keys and non-boolean values are ignored. */
export function parseFlags(raw: string | null): Flags {
  if (!raw) return DEFAULT_FLAGS;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_FLAGS;
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return DEFAULT_FLAGS;
  const flags = { ...DEFAULT_FLAGS };
  for (const name of FLAG_NAMES) {
    const value = (stored as Record<string, unknown>)[name];
    if (typeof value === 'boolean') flags[name] = value;
  }
  return flags;
}

export async function readFlags(store: FlagStore | undefined): Promise<Flags> {
  if (!store) return DEFAULT_FLAGS;
  try {
    return parseFlags(await store.get(FLAGS_KEY));
  } catch {
    return DEFAULT_FLAGS;
  }
}
