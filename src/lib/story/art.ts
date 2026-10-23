/**
 * Story frames as printed pages (task 6.4.2), in the language of the post slides (task 6.2.2):
 * each text frame on its own field under a running head of the highlight's name and its place
 * ("02 / 04"). A heading that starts with a number ("1st of 160 teams", "5 certifications")
 * prints the number large with the pictogram that draws it; any other heading is a title. The
 * frame's own words are the only words: nothing is added but the label and the page.
 */
import type { Highlight } from '../content-schema';
import { pictoFor, type Cover } from '../covers';
import { DARK_FIELDS, markFor, slideFields, type Field, type Mark } from '../fields';

export interface FrameArt {
  /** Undefined for a photo frame: the photo is the page. */
  field?: Field;
  cover?: Exclude<Cover, { layout: 'photo' | 'project' }>;
  /** A highlighter stroke behind the big words, on paper only. */
  mark?: Mark;
  /** What the viewer's own bar (progress, name, buttons) sits on: light fields take ink. */
  ground: 'light' | 'dark';
}

/** The fields highlights start on, in turn, so neighbouring highlights open on different ones. */
const STARTS: readonly Field[] = ['paper', 'ink', 'lime', 'sky', 'emerald', 'cyan', 'ocean'];

/** "1st of 160 teams" → "1st" and "of 160 teams"; "36 hours" → "36" and "hours". */
const NUMBER_FIRST = /^(~?\d+(?:st|nd|rd|th|%|\+)?)\s+(\S.*)$/;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Every frame of a highlight, as printed. `index` is the highlight's place in her row, which
 * picks the field it opens on. O(frames).
 */
export function storyArt({ data }: { data: Highlight }, index: number): FrameArt[] {
  const fields = slideFields(
    STARTS[index % STARTS.length],
    data.frames.map((f) => f.type),
  );
  const n = data.frames.length;
  return data.frames.map((frame, i) => {
    if (frame.type !== 'text') return { ground: 'dark' };
    const field = fields[i];
    const head = [data.label, `${pad(i + 1)} / ${pad(n)}`] as const;
    const number = frame.heading ? NUMBER_FIRST.exec(frame.heading) : null;
    const cover: FrameArt['cover'] = number
      ? {
          layout: 'stat',
          head,
          hero: number[1],
          label: number[2],
          detail: frame.body,
          picto: pictoFor(
            number[1],
            `${number[2]} ${frame.body}`,
            /\bcertif/i.test(number[2]) ? 'certification' : 'achievement',
          ),
        }
      : { layout: 'title', head, title: frame.heading ?? '', label: frame.body };
    return {
      field,
      cover,
      mark: field === 'paper' ? markFor(index + i) : undefined,
      ground: DARK_FIELDS.has(field) ? 'dark' : 'light',
    };
  });
}
