import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The reels (media/reels/paper-reel, task 6.3.1) print words from their scene lists. Like every
 * cover and slide, those words must come from her posts, figures, résumé or profile: this reads
 * every scene list and finds each string in them. Only structural labels ("Stack", "2 / 3")
 * are allowed besides.
 */
const DIR = 'media/reels/paper-reel/variables';
const STRUCTURAL = [/^Stack$/, /^\d+ \/ \d+$/];

/** Lower case, letters, digits and the few signs her figures use; everything else a space. */
const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%~<+.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sources = norm(
  [
    ...readdirSync('src/content/posts').map((f) => readFileSync(`src/content/posts/${f}`, 'utf8')),
    readFileSync('src/content/resume.json', 'utf8'),
    readFileSync('src/content/figures.json', 'utf8'),
    readFileSync('src/content/profile.json', 'utf8'),
  ].join(' '),
);

type Scene = Record<string, unknown>;

/** Every string a scene shows. */
function printed(scene: Scene): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key: string) => {
    // Settings, not words on screen.
    if (['type', 'field', 'mode', 'direction'].includes(key)) return;
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(scene, '');
  return out;
}

const reels = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    id: f.replace(/\.json$/, ''),
    scenes: JSON.parse(JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')).scenes) as Scene[],
  }));

describe('reel scene lists', () => {
  it('cover all six reels on the site', () => {
    const site = Object.keys(JSON.parse(readFileSync('src/content/reels.json', 'utf8'))).sort();
    expect(reels.map((r) => r.id).sort()).toEqual(site);
  });

  it('print only words from her content', () => {
    const missing = reels.flatMap(({ id, scenes }) =>
      scenes
        .flatMap(printed)
        .filter((text) => !STRUCTURAL.some((re) => re.test(text)))
        .filter((text) => !sources.includes(norm(text)))
        .map((text) => `${id}: "${text}"`),
    );
    expect(missing).toEqual([]);
  });

  it('fit 18 seconds with the half-second loop frame after them', () => {
    for (const { id, scenes } of reels) {
      const total = scenes.reduce((sum, s) => sum + Number(s.duration), 0);
      expect(total, id).toBeCloseTo(17.5, 5);
    }
  });
});
