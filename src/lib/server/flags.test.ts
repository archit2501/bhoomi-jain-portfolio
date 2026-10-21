import { describe, expect, it } from 'vitest';
import { DEFAULT_FLAGS, FLAGS_KEY, parseFlags, readFlags } from './flags';

describe('parseFlags', () => {
  it('turns everything on when nothing is stored', () => {
    expect(parseFlags(null)).toEqual(DEFAULT_FLAGS);
    expect(Object.values(DEFAULT_FLAGS).every(Boolean)).toBe(true);
  });

  it('applies stored booleans over the defaults', () => {
    expect(parseFlags('{"ai_chat":false,"dms":false}')).toEqual({
      ...DEFAULT_FLAGS,
      ai_chat: false,
      dms: false,
    });
  });

  it('ignores unknown names and values that are not booleans', () => {
    expect(parseFlags('{"comments":"false","polls":0,"surprise":false}')).toEqual(DEFAULT_FLAGS);
  });

  it('falls back to the defaults on anything that is not a JSON object', () => {
    for (const raw of ['not json', '[]', '42', 'null', '"off"']) {
      expect(parseFlags(raw)).toEqual(DEFAULT_FLAGS);
    }
  });
});

describe('readFlags', () => {
  it('reads the one flags key', async () => {
    const keys: string[] = [];
    const store = {
      get: async (key: string) => {
        keys.push(key);
        return '{"polls":false}';
      },
    };
    expect(await readFlags(store)).toEqual({ ...DEFAULT_FLAGS, polls: false });
    expect(keys).toEqual([FLAGS_KEY]);
  });

  it('keeps the site up when KV is missing or failing', async () => {
    expect(await readFlags(undefined)).toEqual(DEFAULT_FLAGS);
    const broken = { get: async () => Promise.reject(new Error('KV outage')) };
    expect(await readFlags(broken)).toEqual(DEFAULT_FLAGS);
  });
});
