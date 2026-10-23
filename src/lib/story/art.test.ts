import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { highlightSchema, type Highlight } from '../content-schema';
import { DARK_FIELDS } from '../fields';
import { storyArt } from './art';

const highlight = (frames: unknown[], label = 'Projects') => ({
  data: highlightSchema.parse({
    label,
    order: 1,
    cover: { type: 'text', text: 'P' },
    frames,
  }) as Highlight,
});

/** Her highlights, in the row's order (src/lib/content.ts sorts them by order). */
const hers = readdirSync('src/content/highlights')
  .map((f) => ({
    id: f.replace(/\.json$/, ''),
    data: highlightSchema.parse(
      JSON.parse(readFileSync(`src/content/highlights/${f}`, 'utf8')),
    ) as Highlight,
  }))
  .sort((a, b) => a.data.order - b.data.order);

describe('storyArt', () => {
  it('prints a heading that starts with a number large, with the pictogram that draws it', () => {
    const [rank, count, hours] = storyArt(
      highlight([
        { type: 'text', heading: '1st of 160 teams', body: 'Winner of a hackathon.' },
        { type: 'text', heading: '5 certifications', body: 'Cloud and AI.' },
        { type: 'text', heading: '36 hours', body: 'The build window.' },
      ]),
      0,
    );
    expect(rank.cover).toMatchObject({
      layout: 'stat',
      hero: '1st',
      label: 'of 160 teams',
      detail: 'Winner of a hackathon.',
      picto: { type: 'dots', total: 160, lit: 1 },
    });
    expect(count.cover).toMatchObject({
      hero: '5',
      label: 'certifications',
      picto: { type: 'units', count: 5, shape: 'card' },
    });
    // 36 marks would say nothing a number doesn't: no pictogram.
    expect(hours.cover).toMatchObject({ layout: 'stat', hero: '36', label: 'hours' });
    expect(hours.cover && 'picto' in hours.cover && hours.cover.picto).toBeUndefined();
  });

  it('prints any other heading as a title over its words, under the name and the page', () => {
    const [art] = storyArt(
      highlight([
        { type: 'text', heading: 'SmartBlog AI', body: 'A blogging platform.' },
        { type: 'text', body: 'Only words.' },
      ]),
      0,
    );
    expect(art.cover).toEqual({
      layout: 'title',
      head: ['Projects', '01 / 02'],
      title: 'SmartBlog AI',
      label: 'A blogging platform.',
    });
  });

  it('gives each frame its own field, never the one before it, and ink chrome on light ones', () => {
    const frames = Array.from({ length: 5 }, (_, i) => ({ type: 'text', body: `Frame ${i}` }));
    const arts = storyArt(highlight(frames), 0);
    expect(arts[0].field).toBe('paper');
    for (let i = 1; i < arts.length; i++) expect(arts[i].field).not.toBe(arts[i - 1].field);
    for (const art of arts) {
      expect(art.ground).toBe(DARK_FIELDS.has(art.field!) ? 'dark' : 'light');
      // The highlighter stroke is for paper only.
      expect(Boolean(art.mark)).toBe(art.field === 'paper');
    }
  });

  it('opens neighbouring highlights on different fields', () => {
    const one = [{ type: 'text', body: 'Hi' }];
    const firsts = [0, 1, 2, 3].map((i) => storyArt(highlight(one), i)[0].field);
    expect(new Set(firsts).size).toBe(4);
  });

  it('leaves a photo frame to its photo, with the light bar', () => {
    const [art] = storyArt(
      highlight([{ type: 'image', src: 'bhoomi/degree.webp', alt: 'Her degree' }]),
      0,
    );
    expect(art).toEqual({ ground: 'dark' });
  });

  it('prints only her own words on every frame of every highlight', () => {
    hers.forEach((h, i) => {
      storyArt(h, i).forEach((art, f) => {
        const frame = h.data.frames[f];
        if (frame.type !== 'text' || !art.cover) return;
        const { head, ...shown } = art.cover;
        const words = Object.entries(shown)
          .filter(([key, value]) => key !== 'layout' && typeof value === 'string')
          .map(([, value]) => value as string);
        expect(words.join(' ')).toBe([frame.heading, frame.body].filter(Boolean).join(' '));
        expect(head).toEqual([
          h.data.label,
          `${String(f + 1).padStart(2, '0')} / ${String(h.data.frames.length).padStart(2, '0')}`,
        ]);
      });
    });
  });
});
