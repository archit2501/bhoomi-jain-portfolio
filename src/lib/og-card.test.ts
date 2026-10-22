import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { Post, Resume } from './content-schema';
import { coverFor } from './covers';
import { fieldMap } from './fields';
import {
  cardTree,
  h,
  OG_HEIGHT,
  OG_WIDTH,
  photoUri,
  postSpec,
  readTokens,
  renderCard,
} from './og-card';
import { resolveFigures } from './resume';

const resume = JSON.parse(readFileSync('src/content/resume.json', 'utf8')).bhoomi as Resume;
const figures = resolveFigures(
  JSON.parse(readFileSync('src/content/figures.json', 'utf8')),
  resume,
);
const posts = readdirSync('src/content/posts')
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({
    id: f.replace(/\.md$/, ''),
    data: {
      figures: [],
      ...parse(readFileSync(`src/content/posts/${f}`, 'utf8').split('---')[1]),
    } as Post,
  }))
  .sort(
    (a, b) =>
      Number(Boolean(b.data.pinned)) - Number(Boolean(a.data.pinned)) ||
      a.data.order - b.data.order,
  );
const fields = fieldMap(posts);
// OG_PREVIEW=<dir> saves the cards for a look (they're checked by eye, not here).
const preview = process.env.OG_PREVIEW;

/** All the text in a satori tree, in order. */
function words(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (!node || typeof node !== 'object') return [];
  const children = (node as { props?: { children?: unknown } }).props?.children;
  return (Array.isArray(children) ? children : [children]).flatMap(words);
}

async function postCard(id: string) {
  const post = posts.find((p) => p.id === id)!;
  const cover = coverFor(post, figures, resume, new Date('2026-10-22'));
  const field = fields.get(id)!;
  const first = post.data.media.find((m) => m.type === 'text');
  const spec = postSpec(cover, field === 'photo' ? 'paper' : field, {
    head: ['Education', post.data.dateLabel],
    footer: 'Bhoomi Jain · Full Stack Developer',
    headline: first?.type === 'text' ? first.headline : post.data.title,
    detail: first?.type === 'text' ? first.detail : undefined,
    photo: cover.layout === 'photo' ? await photoUri('bhoomi/bca.webp', 540, 630) : undefined,
  });
  return { spec, png: await renderCard(spec) };
}

describe('share cards', () => {
  it('reads her field colours from tokens.css', () => {
    const t = readTokens(readFileSync('src/styles/tokens.css', 'utf8'));
    expect(t['field-paper']).toMatch(/^#[0-9a-f]{6}$/);
    expect(t['field-lime-fg']).toBe('#0c1014');
  });

  it("print a post's cover as a 1200×630 PNG, with only the cover's words", async () => {
    for (const id of [
      'smartblog-ai',
      'cybercup-4-winner',
      'amity-mca',
      'certifications',
      'amity-bca',
    ]) {
      const { spec, png } = await postCard(id);
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([OG_WIDTH, OG_HEIGHT, 'png']);
      expect(png.byteLength).toBeLessThan(300_000);
      const text = words(cardTree(spec)).join(' ');
      expect(text).toContain(spec.big);
      if (preview) writeFileSync(`${preview}/${id}.png`, png);
    }
  }, 60_000);

  it('h() drops empty children and keeps a single child unwrapped', () => {
    expect(h('div', {}, 'a', false, undefined, null).props.children).toBe('a');
    expect(h('div', {}, ['a', 'b']).props.children).toEqual(['a', 'b']);
  });
});
