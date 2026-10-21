import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { postSchema, resumeSchema } from '../src/lib/content-schema';
import { checkResume, findPhoneNumbers, resumeCounts } from '../src/lib/resume';

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
