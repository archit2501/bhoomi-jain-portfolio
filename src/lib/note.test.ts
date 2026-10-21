import { describe, expect, it } from 'vitest';
import { noteExpired } from './note';

describe('noteExpired', () => {
  it('never expires without a date', () => {
    expect(noteExpired(undefined, '2030-01-01')).toBe(false);
  });

  it('lasts through the whole day, month or year it names', () => {
    expect(noteExpired('2026-11-30', '2026-11-30')).toBe(false);
    expect(noteExpired('2026-11-30', '2026-12-01')).toBe(true);
    expect(noteExpired('2026-11', '2026-11-30')).toBe(false);
    expect(noteExpired('2026-11', '2026-12-01')).toBe(true);
    expect(noteExpired('2026', '2026-12-31')).toBe(false);
    expect(noteExpired('2026', '2027-01-01')).toBe(true);
  });
});
