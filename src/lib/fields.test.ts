import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { PostKind } from './content-schema';
import { fieldMap, KIND_FIELDS, markFor, slideFields, type FieldPost } from './fields';

/** Her posts in grid order (pinned first, then by order), as src/lib/content.ts sorts them. */
function realPosts(): FieldPost[] {
  const dir = 'src/content/posts';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const front = parse(readFileSync(`${dir}/${f}`, 'utf8').split('---')[1]);
      return { id: f.replace(/\.md$/, ''), front };
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.front.pinned)) - Number(Boolean(a.front.pinned)) ||
        a.front.order - b.front.order,
    )
    .map(({ id, front }) => ({ id, data: { kind: front.kind, media: front.media } }));
}

const post = (id: string, kind: PostKind, type = 'text'): FieldPost => ({
  id,
  data: { kind, media: [{ type }] },
});

/** True when a tile shares its field with the tile to its left or above. */
function clashes(fields: string[], columns = 3): string[] {
  return fields.flatMap((f, i) => {
    if (f === 'photo') return [];
    const left = i % columns ? fields[i - 1] : undefined;
    const above = fields[i - columns];
    return f === left || f === above ? [`tile ${i + 1} (${f})`] : [];
  });
}

describe('fieldMap', () => {
  it('gives her grid no two neighbouring tiles on the same field', () => {
    const posts = realPosts();
    const map = fieldMap(posts);
    const fields = posts.map((p) => map.get(p.id)!);
    expect(fields).toHaveLength(posts.length);
    expect(clashes(fields)).toEqual([]);
  });

  it('starts each kind on its own first field: paper projects, a lime win, ocean education', () => {
    const map = fieldMap([
      post('a', 'project'),
      post('b', 'project'),
      post('c', 'project'),
      post('win', 'achievement'),
      post('job', 'experience'),
      post('job2', 'experience'),
      post('job3', 'experience'),
      post('mca', 'education'),
    ]);
    expect([...map.values()]).toEqual([
      'paper',
      'ink',
      'paper',
      'lime',
      'paper',
      'ink',
      'cyan',
      'ocean',
    ]);
  });

  it('shows a photo when the post opens on one, and never counts it as a clash', () => {
    const map = fieldMap([post('a', 'education', 'image'), post('b', 'education')]);
    expect(map.get('a')).toBe('photo');
    expect(map.get('b')).toBe('paper');
  });

  it('moves on to another field when its own would touch a neighbour of the same field', () => {
    // Column 1 never repeats the tile above: certifications go paper, ink, paper, ink.
    const certs = fieldMap(['a', 'b', 'c', 'd'].map((id) => post(id, 'certification')));
    expect([...certs.values()]).toEqual(['paper', 'ink', 'paper', 'ink']);
    // The project in tile 5 has paper to its left and ink above, both of its own fields, so it
    // takes the first free one from the shared list.
    const blocked = fieldMap([
      post('a', 'achievement'),
      post('b', 'achievement'),
      post('c', 'log'),
      post('d', 'certification'),
      post('e', 'project'),
    ]);
    expect([...blocked.values()]).toEqual(['lime', 'ink', 'paper', 'paper', 'emerald']);
    const wins = fieldMap(['a', 'b', 'c', 'd', 'e'].map((id) => post(id, 'achievement')));
    expect(clashes([...wins.values()])).toEqual([]);
  });

  it('every kind has at least two fields to alternate between', () => {
    for (const fields of Object.values(KIND_FIELDS)) expect(fields.length).toBeGreaterThan(1);
  });
});

describe('slideFields', () => {
  it('changes field on every slide and keeps the cover field first', () => {
    for (const first of ['paper', 'ink', 'lime', 'ocean'] as const) {
      const fields = slideFields(first, 6);
      expect(fields[0]).toBe(first);
      expect(fields).toHaveLength(6);
      fields.slice(1).forEach((f, i) => expect(f).not.toBe(fields[i]));
    }
  });
});

describe('markFor', () => {
  it('cycles through her ring colours', () => {
    expect([0, 1, 2, 3, 4].map(markFor)).toEqual(['lime', 'cyan', 'sky', 'emerald', 'lime']);
  });
});
