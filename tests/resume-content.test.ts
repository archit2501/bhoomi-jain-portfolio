import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { postSchema, resumeSchema } from '../src/lib/content-schema';
import type { SiteContent } from '../src/lib/content-guards';
import { checkResume, findPhoneNumbers, resumeCounts } from '../src/lib/resume';
import { buildSearchIndex, prepare, search } from '../src/lib/search';

/**
 * The real content, checked the same way the build checks it, so a wrong title or a phone number
 * fails `npm test` and not only `npm run build`.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT = join(ROOT, 'src', 'content');

function files(dir: string, test: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, test);
    return test.test(name) ? [path] : [];
  });
}

const resume = resumeSchema.parse(
  Object.values(JSON.parse(readFileSync(join(CONTENT, 'resume.json'), 'utf8')))[0],
);
const posts = files(join(CONTENT, 'posts'), /\.md$/).map((path) => {
  const [, front, body] = readFileSync(path, 'utf8').split(/^---$/m);
  return { id: path, data: postSchema.parse(parse(front)), body };
});

describe('her real content', () => {
  it('matches the résumé: every entry has a post, with the résumé wording', () => {
    expect(checkResume(resume, posts)).toEqual([]);
  });

  it('has the résumé as of 2026: 3 projects, 3 internships, 2 degrees, 5 certifications', () => {
    expect(resumeCounts(resume)).toEqual({
      projects: 3,
      experience: 3,
      education: 2,
      certifications: 5,
    });
  });

  it('has no phone number in any content file', () => {
    const found = files(CONTENT, /\.(json|md)$/).flatMap((path) =>
      findPhoneNumbers(readFileSync(path, 'utf8')).map((phone) => `${path}: ${phone}`),
    );
    expect(found).toEqual([]);
  });

  // After `npm run build`, the pages themselves: visible text only (no SVG paths or scripts).
  it.skipIf(!existsSync(join(ROOT, 'dist')))('has no phone number on any built page', () => {
    const found = files(join(ROOT, 'dist'), /\.html$/).flatMap((path) => {
      const text = readFileSync(path, 'utf8')
        .replace(/<(svg|script|style)\b[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]+>/g, ' ');
      return findPhoneNumbers(text).map((phone) => `${path}: ${phone}`);
    });
    expect(found).toEqual([]);
  });
});

describe('the search index built from her content', () => {
  const highlights = files(join(CONTENT, 'highlights'), /\.json$/).map((path) => ({
    id: path.replace(/^.*\/(.+)\.json$/, '$1'),
    data: { inRow: true, ...JSON.parse(readFileSync(path, 'utf8')) },
  }));
  const index = buildSearchIndex({
    posts: posts.map((p) => ({ ...p, id: p.id.replace(/^.*\/(.+)\.md$/, '$1') })),
    highlights,
    reels: [],
    resume,
  } as unknown as SiteContent);

  const prepared = prepare(index);
  const titles = (query: string) => search(prepared, query).map((i) => i.title);

  it('has every post, highlight in the row, skill and certification on the résumé, and tags', () => {
    const skills = Object.values(resume.skills).flat().length;
    const row = highlights.filter((h) => h.data.inRow).length;
    const stacks = new Set(
      Object.values(resume.projects).flatMap((p) => p.stack.map((s) => s.toLowerCase())),
    );
    expect(index.filter((i) => i.tab === 'tags').length).toBeGreaterThanOrEqual(stacks.size - 2);
    expect(index.filter((i) => i.tab !== 'tags')).toHaveLength(
      posts.length + row + skills + resume.certifications.length,
    );
    // A few KB inlined in every page.
    expect(JSON.stringify(index).length).toBeLessThan(16_000);
  });

  it('finds a project by a technology in its stack', () => {
    expect(titles('mongodb')).toEqual(['MongoDB', '#mongodb', 'SmartBlog AI']);
    expect(titles('fastapi')).toEqual(['FastAPI', '#fastapi', 'Conversational AI Web App']);
  });

  it("forgives typos in her real content: 'reakt' finds React", () => {
    expect(titles('reakt')[0]).toBe('ReactJS');
    expect(titles('mongdb')[0]).toBe('MongoDB');
    expect(titles('amity unversity')).toContain('Master of Computer Applications (MCA)');
  });
});
