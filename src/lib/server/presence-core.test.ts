import { describe, expect, it } from 'vitest';
import { activeLabel, parseBroadcast, parseClient, parseServer } from './presence-core';

describe('the live protocol', () => {
  it('accepts only a small ping from visitors', () => {
    expect(parseClient('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseClient('{"type":"poll","poll":"x","results":{}}')).toBeNull();
    expect(parseClient('not json')).toBeNull();
    expect(parseClient(new ArrayBuffer(4))).toBeNull();
    expect(parseClient(`{"type":"ping","pad":"${'x'.repeat(300)}"}`)).toBeNull();
  });

  it('broadcasts only well-formed poll results, dropping bad counts', () => {
    expect(
      parseBroadcast({ type: 'poll', poll: 'p', results: { 0: 3, 1: -1, 2: 'x', 3: 2 } }),
    ).toEqual({
      type: 'poll',
      poll: 'p',
      results: { 0: 3, 3: 2 },
    });
    for (const bad of [
      null,
      'x',
      { type: 'count' },
      { type: 'poll', poll: 1, results: {} },
      { type: 'poll', poll: 'p', results: [1] },
    ]) {
      expect(parseBroadcast(bad)).toBeNull();
    }
  });

  it('reads counts and poll results from the server, ignoring anything else', () => {
    expect(parseServer('{"type":"count","count":4}')).toEqual({ type: 'count', count: 4 });
    expect(parseServer('{"type":"poll","poll":"p","results":{"0":1}}')).toEqual({
      type: 'poll',
      poll: 'p',
      results: { 0: 1 },
    });
    expect(parseServer('{"type":"count","count":-1}')).toBeNull();
    expect(parseServer('nonsense')).toBeNull();
    expect(parseServer(42)).toBeNull();
  });

  it('labels the visitor count, counting the visitor themself', () => {
    expect(activeLabel(0)).toBe('Active now · just you here');
    expect(activeLabel(1)).toBe('Active now · just you here');
    expect(activeLabel(3)).toBe('Active now · 3 here');
  });
});
