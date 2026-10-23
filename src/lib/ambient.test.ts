import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ambientStyle, dominantColors, FIELD_AMBIENT } from './ambient';
import { FIELDS } from './fields';
import { ambientOf } from './ambient-image';

const image = (...runs: [number, [number, number, number]][]) =>
  new Uint8Array(runs.flatMap(([n, rgb]) => Array.from({ length: n }, () => rgb).flat()));

describe('dominantColors', () => {
  it('the commonest colour first, then one clearly different', () => {
    const [a, b] = dominantColors(
      image([60, [7, 89, 133]], [30, [12, 16, 20]], [10, [8, 90, 134]]),
      3,
    );
    expect(a).toBe('#075985');
    expect(b).toBe('#0c1014');
  });

  it('prefers colour over a slightly larger grey', () => {
    const [a] = dominantColors(image([50, [128, 128, 128]], [45, [3, 105, 161]]), 3);
    expect(a).toBe('#0369a1');
  });

  it('a single colour gets a darker partner; transparent pixels are skipped', () => {
    expect(dominantColors(image([10, [200, 100, 0]]), 3)).toEqual(['#c86400', '#643200']);
    const rgba = new Uint8Array([255, 0, 0, 0, 0, 0, 255, 255]);
    expect(dominantColors(rgba, 4)[0]).toBe('#0000ff');
    expect(dominantColors(new Uint8Array(), 3)).toEqual(['#0c1014', '#0c1014']);
  });

  it('as CSS custom properties', () => {
    expect(ambientStyle(['#000000', '#ffffff'])).toBe('--ambient-a: #000000; --ambient-b: #ffffff');
  });
});

describe('ambientOf', () => {
  it('samples a real reel poster, and nothing for a missing file', async () => {
    const colours = await ambientOf('/reels/smartblog-ai.webp');
    expect(colours).toHaveLength(2);
    expect(colours![0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(await ambientOf('/reels/nope.webp')).toBeNull();
  });
});

describe('FIELD_AMBIENT', () => {
  const tokens = readFileSync('src/styles/tokens.css', 'utf8');
  const token = (field: string) =>
    new RegExp(`--field-${field}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1];

  it('glows in each field’s own colour (ink, lifted off the black behind it)', () => {
    for (const field of FIELDS) {
      expect(FIELD_AMBIENT[field]).toHaveLength(2);
      if (field !== 'ink') expect([field, FIELD_AMBIENT[field][0]]).toEqual([field, token(field)]);
    }
  });
});
