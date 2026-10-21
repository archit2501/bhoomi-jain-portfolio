import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MEDIA = fileURLToPath(new URL('../src/assets/media/', import.meta.url));

function photos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return photos(path);
    return /\.(jpe?g|png|webp|avif)$/i.test(name) ? [relative(MEDIA, path)] : [];
  });
}

describe('photo placeholders', () => {
  const placeholders = JSON.parse(readFileSync(join(MEDIA, 'placeholders.json'), 'utf8'));

  it('has one for every photo (run `npm run build`, which regenerates them)', () => {
    expect(Object.keys(placeholders).sort()).toEqual(photos(MEDIA).sort());
  });

  it('keeps each one tiny: a colour and a preview of a few hundred bytes', () => {
    for (const [path, entry] of Object.entries(placeholders) as [
      string,
      Record<string, string>,
    ][]) {
      expect(entry.color, path).toMatch(/^#[0-9a-f]{6}$/);
      expect(entry.preview, path).toMatch(/^data:image\/webp;base64,/);
      expect(entry.preview.length, path).toBeLessThan(1200);
    }
  });
});
