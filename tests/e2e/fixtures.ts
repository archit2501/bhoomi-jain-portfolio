/**
 * What the end-to-end tests expect, read from the same content files the site is built from.
 * Swapping the content (or forking the site for someone else) needs no test edits.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Figure, Highlight, Post, Profile, Reel } from '../../src/lib/content-schema';
import { postDate } from '../../src/lib/post-date';
import { pageTitle, PROFILE_ID, site } from '../../src/lib/site';
import { frameDuration } from '../../src/lib/story/controller';

// Not Astro's default 4321, nor a port another local portfolio already uses (4417, 4427).
export const PORT = 4447;
export const BASE = `http://localhost:${PORT}`;

const CONTENT = fileURLToPath(new URL('../../src/content/', import.meta.url));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(CONTENT, path), 'utf8'));
const files = (dir: string, ext: string) =>
  readdirSync(join(CONTENT, dir)).filter((name) => name.endsWith(ext));

export const profile = readJson<Record<string, Profile>>('profile.json')[PROFILE_ID];
export const figures = readJson<Record<string, Figure>>('figures.json');
export const NAME = profile.displayName;
export const FIRST_NAME = NAME.split(/\s+/)[0];
export const HOME_TITLE = pageTitle();
export { pageTitle, site };

type Entry<T> = { id: string; data: T };

/** Posts in grid order: pinned first, then by `order` (as in src/lib/content.ts). */
export const posts: (Entry<Post> & { body: string })[] = files('posts', '.md')
  .map((name) => {
    const [, front, body] = readFileSync(join(CONTENT, 'posts', name), 'utf8').split(/^---$/m);
    const data = parse(front) as Post;
    return { id: name.replace(/\.md$/, ''), data: { ...data, pinned: !!data.pinned }, body };
  })
  .sort((a, b) => Number(b.data.pinned) - Number(a.data.pinned) || a.data.order - b.data.order);

export const highlights: Entry<Highlight>[] = files('highlights', '.json')
  .map((name) => {
    const data = readJson<Highlight>(join('highlights', name));
    return { id: name.replace(/\.json$/, ''), data: { ...data, inRow: data.inRow ?? true } };
  })
  .sort((a, b) => a.data.order - b.data.order);

/** The highlights shown in the row under the bio (the intro opens from the avatar instead). */
export const row = highlights.filter((h) => h.data.inRow);

export const reels: Entry<Reel>[] = Object.entries(readJson<Record<string, Reel>>('reels.json'))
  .map(([id, data]) => ({ id, data }))
  .sort((a, b) => a.data.order - b.data.order);
export const videoReels = reels.filter((r) => r.data.video);

/** The accessible name of a grid tile, as PostTile builds it. */
export function tileName(post: Entry<Post>): string {
  const { pinned, media, title } = post.data;
  return [pinned && 'Pinned post.', media.length > 1 && `Carousel, ${media.length} slides.`, title]
    .filter(Boolean)
    .join(' ');
}

/** The accessible name of a highlight in the row. */
export function highlightName(h: Entry<Highlight>): string {
  const n = h.data.frames.length;
  return `Highlight: ${h.data.label}, ${n} ${n === 1 ? 'story' : 'stories'}`;
}

/** Text that identifies one story frame on screen. */
export function frameText(h: Entry<Highlight>, i: number): string {
  const frame = h.data.frames[i];
  if (frame.type === 'image') return frame.caption ?? frame.alt;
  return frame.heading ?? frame.body;
}

/** How long a frame stays up before it advances on its own (as StoryViewer computes it). */
export function frameMs(h: Entry<Highlight>, i: number): number {
  const frame = h.data.frames[i];
  const words =
    frame.type === 'text'
      ? [frame.heading, frame.body].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length
      : undefined;
  return frameDuration({ durationMs: frame.durationMs, words });
}

/** The three-number row under her name: "<value> <label>". */
export const statTexts = profile.stats.map((id) => `${figures[id].value} ${figures[id].label}`);

/** The date line under a post's actions, if it has one. */
export const dateText = (post: Entry<Post>) => postDate(post.data.date, post.data.dateLabel)?.text;

/** The first sentence of a caption, enough to recognise it. */
export const captionStart = (post: { body: string }) => post.body.trim().split(/(?<=\.)\s/)[0];
