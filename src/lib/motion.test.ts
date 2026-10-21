import { describe, expect, it } from 'vitest';
import { durationMs } from './motion';

describe('durationMs', () => {
  it('reads milliseconds and seconds, as written or as the minifier rewrites them', () => {
    expect(durationMs('420ms')).toBe(420);
    expect(durationMs('.9s')).toBe(900);
    expect(durationMs(' 0.35s ')).toBe(350);
    expect(durationMs('1s')).toBe(1000);
  });

  it('gives up on anything else', () => {
    expect(durationMs('')).toBeUndefined();
    expect(durationMs('fast')).toBeUndefined();
    expect(durationMs('300')).toBeUndefined();
    expect(durationMs('calc(1s * 2)')).toBeUndefined();
  });
});
