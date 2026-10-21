import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the site clear of Instagram's own brand assets (research/02-market-tech.md §5):
 * its story-ring gradient and primary blues, its name in titles or meta tags, script
 * wordmark fonts that imitate its logo, and "insta"/"gram" in the domain.
 */
// fileURLToPath, not .pathname: a URL path keeps %20 for spaces, and then nothing is scanned.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED = ['src', 'public'];
const TEXT_FILE = /\.(astro|css|ts|js|mjs|json|md|svg|html|txt|webmanifest)$/;

const FORBIDDEN_HEX = [
  '#ffd600',
  '#ff7a00',
  '#ff0169',
  '#d300c5',
  '#7638fa',
  '#fdd074',
  '#f77f34',
  '#dd326e',
  '#d82b7e',
  '#a432b1',
  '#4a5df9',
  '#4150f7',
  '#0095f6',
];
const SCRIPT_FONTS = /\b(billabong|lobster|grand hotel|instagram sans)\b/i;
const NAME_IN_TITLE = /<title>[^<]*instagram[^<]*<\/title>/i;
const NAME_IN_META = /<meta[^>]+content=["'][^"']*instagram[^"']*["']/i;

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return TEXT_FILE.test(name) ? [path] : [];
  });
}

function brandViolations(paths: string[], root = ROOT): string[] {
  const found: string[] = [];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    const lower = text.toLowerCase();
    const where = relative(root, path);
    for (const hex of FORBIDDEN_HEX) {
      if (lower.includes(hex)) found.push(`${where}: Instagram brand colour ${hex}`);
    }
    if (SCRIPT_FONTS.test(text))
      found.push(`${where}: script wordmark font that imitates Instagram's logo`);
    if (NAME_IN_TITLE.test(text)) found.push(`${where}: "Instagram" in a <title>`);
    if (NAME_IN_META.test(text)) found.push(`${where}: "Instagram" in a meta tag`);
  }
  return found;
}

describe('brand guard', () => {
  it('finds no Instagram brand assets in src/ or public/', () => {
    expect(brandViolations(SCANNED.flatMap((d) => files(join(ROOT, d))))).toEqual([]);
  });

  // CI runs this file again after `npm run build`, so the built pages are scanned too.
  it.skipIf(!existsSync(join(ROOT, 'dist')))(
    'finds no Instagram brand assets in the built site',
    () => {
      const built = files(join(ROOT, 'dist')).filter((f) => /\.(html|css|js|xml|txt)$/.test(f));
      expect(built.length).toBeGreaterThan(0);
      expect(brandViolations(built)).toEqual([]);
    },
  );

  // Production builds pass her domain as SITE_URL (the Deploy workflow runs this file with it).
  it('keeps "insta" and "gram" out of the domain', () => {
    const cname = join(ROOT, 'public', 'CNAME');
    const domains = [
      process.env.SITE_URL ? new URL(process.env.SITE_URL).hostname : '',
      existsSync(cname) ? readFileSync(cname, 'utf8').trim() : '',
    ];
    for (const domain of domains) expect(domain.toLowerCase()).not.toMatch(/insta|gram/);
  });

  // Instagram's own glyphs can't be kept here to compare against, so instead every icon must come
  // through Icon.astro (Phosphor), and brand-logo glyphs from any icon set are off limits.
  it('draws every icon through Icon.astro, and never a brand logo', () => {
    const LOGOS = /(instagram|threads|meta|facebook|messenger|whatsapp)-logo/;
    const found: string[] = [];
    for (const path of files(join(ROOT, 'src'))) {
      const text = readFileSync(path, 'utf8');
      const where = relative(ROOT, path);
      if (LOGOS.test(text)) found.push(`${where}: brand-logo icon`);
      if (/@phosphor-icons\/core|@lucide\/|lucide-/.test(text) && !where.endsWith('Icon.astro')) {
        found.push(`${where}: icon imported outside Icon.astro`);
      }
    }
    expect(found).toEqual([]);
  });

  it('catches each kind of violation', () => {
    const sample = join(ROOT, 'tests', 'fixtures', 'brand-violations.html');
    expect(brandViolations([sample])).toEqual([
      'tests/fixtures/brand-violations.html: Instagram brand colour #ff0169',
      'tests/fixtures/brand-violations.html: Instagram brand colour #4a5df9',
      "tests/fixtures/brand-violations.html: script wordmark font that imitates Instagram's logo",
      'tests/fixtures/brand-violations.html: "Instagram" in a <title>',
      'tests/fixtures/brand-violations.html: "Instagram" in a meta tag',
    ]);
  });
});
