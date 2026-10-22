/**
 * The colour fields posts are printed on (task 6.1.1, research/visual-overhaul/00-synthesis.md).
 * Paper and ink carry the editorial look; her four ring colours and ocean break the grid up, so
 * no two neighbouring tiles share a field and each kind of post is recognisable at a glance.
 * The colours are tokens in src/styles/tokens.css (`--field-<name>`), checked for contrast in
 * tests/contrast.test.ts.
 */
import type { PostKind } from './content-schema';

export const FIELDS = ['paper', 'ink', 'deep', 'lime', 'emerald', 'cyan', 'sky', 'ocean'] as const;
export type Field = (typeof FIELDS)[number];

/** A post that opens on a photo shows the photo, not a field. */
export type TileField = Field | 'photo';

/** Fields with light text on them; the rest take ink. */
export const DARK_FIELDS: ReadonlySet<Field> = new Set(['ink', 'deep', 'ocean']);

/**
 * Each kind's fields, in the order its posts take them: the first project is paper, the second
 * ink, and so on. A field that would sit next to the same field moves on to the next one.
 */
export const KIND_FIELDS: Record<PostKind, readonly Field[]> = {
  project: ['paper', 'ink'],
  achievement: ['lime', 'ink'],
  experience: ['paper', 'ink', 'cyan', 'emerald'],
  education: ['ocean', 'paper', 'ink'],
  certification: ['paper', 'ink'],
  log: ['paper', 'sky'],
};

/** Tried in this order when a kind's own fields would all touch a neighbour of the same field. */
const FALLBACK: readonly Field[] = ['paper', 'ink', 'emerald', 'cyan', 'sky', 'lime', 'ocean'];

export interface FieldPost {
  id: string;
  data: { kind: PostKind; media: readonly { type: string }[] };
}

/**
 * The field of every post, from the grid's order (pinned first, then by order), checked against
 * the tile to the left and the tile above. A post keeps this field everywhere it appears: grid,
 * Explore, feed and its own first slide. O(n) for n posts.
 */
export function fieldMap(posts: readonly FieldPost[], columns = 3): Map<string, TileField> {
  const placed: TileField[] = [];
  const seen = new Map<PostKind, number>();
  const map = new Map<string, TileField>();
  posts.forEach(({ id, data }, i) => {
    const nth = seen.get(data.kind) ?? 0;
    seen.set(data.kind, nth + 1);
    let field: TileField;
    if (data.media[0]?.type === 'image') {
      field = 'photo';
    } else {
      const left = i % columns === 0 ? undefined : placed[i - 1];
      const above = placed[i - columns];
      const own = KIND_FIELDS[data.kind];
      const rotated = [...own.slice(nth % own.length), ...own.slice(0, nth % own.length)];
      field = [...rotated, ...FALLBACK].find((f) => f !== left && f !== above) ?? rotated[0];
    }
    placed.push(field);
    map.set(id, field);
  });
  return map;
}

/**
 * The fields of a post's slides after the first: each slide changes field, never repeating the
 * one before it, so a carousel reads as a sequence of printed pages. O(n) for n slides.
 */
export function slideFields(first: Field, count: number): Field[] {
  const order: readonly Field[] = ['paper', 'deep', 'ink', 'lime', 'sky', 'emerald', 'cyan'];
  const fields = [first];
  let next = (order.indexOf(first) + 1) % order.length;
  while (fields.length < count) {
    const candidate = order[next];
    next = (next + 1) % order.length;
    if (candidate !== fields[fields.length - 1]) fields.push(candidate);
  }
  return fields;
}

/** The highlighter colour for a post on paper: her ring stops in turn, by grid position. */
export const MARKS = ['lime', 'cyan', 'sky', 'emerald'] as const;
export type Mark = (typeof MARKS)[number];
export const markFor = (index: number): Mark => MARKS[index % MARKS.length];
