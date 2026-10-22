import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { Post, Resume } from './content-schema';
import { coverFor, parseSpan, pictoFor, slideArt, type Cover } from './covers';
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
  }));
const covers = new Map(
  posts.map((p) => [p.id, coverFor(p, figures, resume, new Date('2026-10-22'))] as const),
);

/** Every word a cover prints, apart from the kind labels in its running head. */
function printed(cover: Cover): (string | undefined)[] {
  switch (cover.layout) {
    case 'photo':
      return [];
    case 'project':
      return [cover.head[1], cover.title, cover.deck, ...cover.layers, ...cover.stack];
    case 'stat':
      return [cover.head[1], cover.who, cover.hero, cover.label, cover.detail];
    case 'title':
      return [cover.head[1], cover.title, cover.label, cover.timeline?.from, cover.timeline?.to];
  }
}

describe('her covers', () => {
  it('pick a layout per kind: projects, numbers, a degree, and the photo', () => {
    expect(covers.get('smartblog-ai')?.layout).toBe('project');
    expect(covers.get('cybercup-4-winner')?.layout).toBe('stat');
    expect(covers.get('themobiadz')?.layout).toBe('stat');
    expect(covers.get('certifications')?.layout).toBe('stat');
    expect(covers.get('amity-mca')?.layout).toBe('title');
    expect(covers.get('amity-bca')?.layout).toBe('photo');
  });

  it('print only words from the post, its figures or her résumé', () => {
    for (const post of posts) {
      const source = [
        JSON.stringify(post.data),
        ...post.data.figures.map((id) => `${figures[id]?.value} ${figures[id]?.label}`),
        JSON.stringify(resume.projects),
      ].join(' ');
      for (const words of printed(covers.get(post.id)!)) {
        if (words) expect(source, `${post.id}: "${words}"`).toContain(words);
      }
    }
  });

  it('draw the CyberCup win as 160 dots with her place lit, from the figure', () => {
    expect(covers.get('cybercup-4-winner')).toMatchObject({
      hero: '1st',
      label: 'of 160 teams',
      detail: 'CyberCup 4.0 national-level hackathon',
      picto: { type: 'dots', total: 160, lit: 1 },
    });
  });

  it('name the company on a job, and the layers of a project from its diagram', () => {
    expect(covers.get('themobiadz')).toMatchObject({ who: 'TheMobiAdz', hero: '35%' });
    expect(covers.get('smartblog-ai')).toMatchObject({
      title: 'SmartBlog AI',
      layers: ['React SPA', 'Node.js / Express REST API', 'MongoDB'],
      stack: ['ReactJS', 'Tailwind', 'React Router', 'React Query'],
    });
  });

  it('date a degree in progress from its span, without printing a percentage', () => {
    const mca = covers.get('amity-mca');
    expect(mca).toMatchObject({
      layout: 'title',
      title: 'MCA',
      timeline: { from: 'Jul 2025', to: 'Jun 2027', note: 'expected' },
    });
    // 15 of 23 months on 22 Oct 2026.
    expect(mca?.layout === 'title' && mca.timeline?.progress).toBeCloseTo(15 / 23, 1);
  });
});

describe('pictoFor', () => {
  it('draws a place out of a field as dots', () => {
    expect(pictoFor('1st', 'of 160 teams', 'achievement')).toEqual({
      type: 'dots',
      total: 160,
      lit: 1,
    });
    expect(pictoFor('2nd', 'of 5000 teams', 'achievement')).toBeUndefined();
  });

  it('draws a percentage only as a change with a direction from her own words', () => {
    expect(pictoFor('35%', 'longer average interaction time', 'experience')).toEqual({
      type: 'change',
      percent: 35,
      direction: 'up',
    });
    expect(pictoFor('~45%', 'fewer redundant network calls', 'project')).toEqual({
      type: 'change',
      percent: 45,
      direction: 'down',
    });
    expect(pictoFor('40%', 'of the budget', 'project')).toBeUndefined();
  });

  it('draws small counts one mark each, cards for certificates, and leaves the rest alone', () => {
    expect(pictoFor('4', 'automated reporting dashboards', 'experience')).toEqual({
      type: 'units',
      count: 4,
      plus: false,
      shape: 'square',
    });
    expect(pictoFor('12+', 'modules', 'experience')).toMatchObject({ count: 12, plus: true });
    expect(pictoFor('5', 'certifications', 'certification')).toMatchObject({ shape: 'card' });
    for (const hero of ['<1.5s', '+18', '1', '500+', '3 hrs/week']) {
      expect(pictoFor(hero, 'anything', 'experience'), hero).toBeUndefined();
    }
  });
});

describe('parseSpan', () => {
  it('reads the months and the note of a span', () => {
    expect(parseSpan('Jul 2025 – Jun 2027 (expected)')).toMatchObject({
      from: 'Jul 2025',
      to: 'Jun 2027',
      note: 'expected',
    });
    expect(parseSpan('2024')).toBeUndefined();
  });
});

describe('slideArt', () => {
  const art = (id: string, first: Parameters<typeof slideArt>[1]) => {
    const post = posts.find((p) => p.id === id)!;
    return slideArt(post, first, covers.get(id)!);
  };

  it('opens on the cover, puts the diagram on deep, and turns numbers into stat pages', () => {
    const slides = art('smartblog-ai', 'paper');
    expect(slides.map((s) => s.field)).toEqual(['paper', 'deep', 'ink', 'lime']);
    expect(slides[0].cover).toBe(covers.get('smartblog-ai'));
    expect(slides[1].cover).toBeUndefined();
    expect(slides[2].cover).toMatchObject({
      layout: 'stat',
      head: ['Project', '03 / 04'],
      hero: '~45%',
      picto: { type: 'change', direction: 'down', percent: 45 },
    });
    expect(slides[3].cover).toMatchObject({ layout: 'title', title: 'JWT + bcrypt' });
  });

  it("names the company on a job's pages and draws 12+ modules as twelve marks and a plus", () => {
    const slides = art('themobiadz', 'paper');
    expect(slides[1].cover).toMatchObject({
      head: ['TheMobiAdz', '02 / 03'],
      picto: { type: 'units', count: 12, plus: true },
    });
  });

  it('leaves a photo slide to the photo, and still prints the slides after it', () => {
    const slides = art('amity-bca', 'photo');
    expect(slides[0].cover).toBeUndefined();
    expect(slides[1].cover).toMatchObject({ layout: 'title', title: 'BCA' });
  });

  it('prints only words from the post on every page', () => {
    for (const post of posts) {
      const source = JSON.stringify(post.data);
      for (const slide of slideArt(post, 'paper', covers.get(post.id)!).slice(1)) {
        if (!slide.cover) continue;
        for (const words of printed(slide.cover).slice(1)) {
          if (words) expect(source, `${post.id}: "${words}"`).toContain(words);
        }
      }
    }
  });
});
