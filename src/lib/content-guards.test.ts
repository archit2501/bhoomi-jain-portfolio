import { describe, expect, it, vi } from 'vitest';
import { assertContent, checkContent, type SiteContent } from './content-guards';
import {
  dmThreadSchema,
  eventSchema,
  figureSchema,
  highlightSchema,
  postSchema,
  profileSchema,
  testimonialSchema,
  type Figure,
  type Resume,
} from './content-schema';

/** No résumé entries, so the résumé checks (tested in resume.test.ts) stay out of the way. */
const emptyResume: Resume = {
  source: 'test',
  name: 'Bhoomi Jain',
  location: 'Delhi, India',
  email: 'test@example.com',
  linkedin: 'https://www.linkedin.com/in/example',
  experience: {},
  projects: {},
  skills: {},
  education: {},
  achievements: {},
  certifications: [],
};

const figure = (value: string, label: string, verified = true): Figure => ({
  value,
  label,
  source: 'resume',
  verified,
});

function site(overrides: Partial<SiteContent> = {}): SiteContent {
  return {
    profile: profileSchema.parse({
      username: 'bhoomi.jain',
      displayName: 'Bhoomi Jain',
      category: 'Full Stack Developer',
      bio: 'Full stack developer in Delhi',
      location: 'Delhi, India',
      avatar: { alt: 'Bhoomi Jain' },
      stats: ['revenue', 'deals', 'workflow'],
      links: { linkedin: 'https://www.linkedin.com/in/example' },
    }),
    resume: emptyResume,
    figures: {
      revenue: figure('$100K+', 'revenue'),
      deals: figure('7+', 'deals'),
      workflow: figure('65%', 'workflow gain'),
    },
    posts: [
      {
        id: 'revenue-100k',
        body: 'I generated $100K+ in revenue through 7+ sales.',
        data: postSchema.parse({
          title: '$100K+ in revenue',
          kind: 'log',
          order: 1,
          pinned: true,
          date: '2026-05-01',
          media: [{ type: 'text', headline: '$100K+' }],
          figures: ['revenue', 'deals'],
        }),
      },
    ],
    highlights: [
      {
        id: 'projects',
        data: highlightSchema.parse({
          label: 'Projects',
          order: 1,
          cover: { type: 'text', text: '</>' },
          figures: ['workflow'],
          frames: [{ type: 'text', heading: '65%', body: 'workflow gain' }],
        }),
      },
    ],
    reels: [{ id: 'revenue', data: { title: '$100K+ in revenue', order: 1, figure: 'revenue' } }],
    events: [],
    dmThreads: [],
    ...overrides,
  };
}

const post = (
  id: string,
  order: number,
  extra: Record<string, unknown> = {},
  body = 'Caption',
) => ({
  id,
  body,
  data: postSchema.parse({
    title: id,
    kind: 'log',
    order,
    date: '2025-01-01',
    media: [{ type: 'text', headline: id }],
    ...extra,
  }),
});

describe('checkContent', () => {
  it('passes valid, fully verified content', () => {
    expect(checkContent(site(), { requireVerified: true })).toEqual({ errors: [], unverified: [] });
  });

  it('lists unverified figures without failing a normal build', () => {
    const content = site({ figures: { ...site().figures, deals: figure('7+', 'deals', false) } });
    const result = checkContent(content, { requireVerified: false });
    expect(result.errors).toEqual([]);
    expect(result.unverified).toEqual(['deals: 7+ deals']);
  });

  it('fails the deploy build on unverified figures', () => {
    const content = site({ figures: { ...site().figures, deals: figure('7+', 'deals', false) } });
    const { errors } = checkContent(content, { requireVerified: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('deals: 7+ deals');
  });

  it('rejects stats, posts, highlights and reels that point at unknown figures', () => {
    const base = site();
    const content = site({
      profile: { ...base.profile, stats: ['revenue', 'deals', 'missing'] },
      posts: [post('a', 1, { figures: ['nope'] })],
      highlights: [{ id: 'h', data: { ...base.highlights[0].data, figures: ['ghost'] } }],
      reels: [{ id: 'r', data: { title: 'x', order: 1, figure: 'void' } }],
    });
    const { errors } = checkContent(content, { requireVerified: false });
    expect(errors).toEqual([
      'profile stats: unknown figure "missing"',
      'post a: unknown figure "nope"',
      'highlight h: unknown figure "ghost"',
      'reel r: unknown figure "void"',
    ]);
  });

  it('rejects a figure that is listed but never shown', () => {
    const content = site({ posts: [post('a', 1, { figures: ['workflow'] }, 'No numbers here')] });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([
      'post a: figure "workflow" (65%) is listed but never shown',
    ]);
  });

  it('counts figures shown in text tiles and image captions', () => {
    const base = site();
    const content = site({
      posts: [
        post('a', 1, {
          figures: ['workflow'],
          media: [{ type: 'text', headline: 'x', detail: '65% faster' }],
        }),
      ],
      highlights: [
        {
          id: 'h',
          data: highlightSchema.parse({
            ...base.highlights[0].data,
            frames: [{ type: 'image', src: '/a.webp', alt: 'A', caption: '65% faster' }],
          }),
        },
      ],
    });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([]);
  });

  it('enforces caption length, empty captions, unique order and the pinned limit', () => {
    const content = site({
      posts: [
        post('long', 1, {}, 'x'.repeat(2201)),
        post('empty', 2, {}, '   '),
        post('dupe', 2),
        post('p1', 3, { pinned: true }),
        post('p2', 4, { pinned: true }),
        post('p3', 5, { pinned: true }),
        post('p4', 6, { pinned: true }),
      ],
    });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([
      'post long: caption is 2201 characters, limit is 2200',
      'post empty: caption is empty',
      'post dupe: order 2 is already used',
      '4 posts are pinned, limit is 3',
    ]);
  });
});

describe('résumé, events, DM threads and privacy', () => {
  const thread = (order: number, ai = false) =>
    dmThreadSchema.parse({ order, label: `t${order}`, opener: 'Hi', ai });

  it('passes the résumé checks through, so a wrong job title fails the build', () => {
    const resume: Resume = {
      ...emptyResume,
      experience: {
        acme: {
          org: 'Acme',
          role: 'Developer (Intern)',
          start: '2023-07',
          end: '2023-09',
          bullets: ['x'],
        },
      },
    };
    const content = site({
      resume,
      posts: [
        post('acme', 1, { kind: 'experience', resumeRef: 'experience/acme', title: 'AI Lead' }),
      ],
    });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([
      'post acme: title "AI Lead" differs from the résumé\'s "Developer (Intern)"',
    ]);
  });

  it('accepts events that point at any résumé list', () => {
    const resume: Resume = {
      ...emptyResume,
      projects: { app: { name: 'App', years: '2024', stack: ['React'], bullets: ['x'] } },
      experience: {
        acme: { org: 'Acme', role: 'Dev', start: '2023-07', end: '2023-09', bullets: ['x'] },
      },
      education: {
        bca: { degree: 'BCA', school: 'Uni', start: '2022-09', end: '2025-04', expected: false },
      },
      achievements: { win: { title: 'Winner', detail: '1st' } },
      certifications: [{ name: 'Cert' }],
    };
    const events = [
      'projects/app',
      'experience/acme',
      'education/bca',
      'achievements/win',
      'certifications',
    ].map((ref, i) => ({
      id: `e${i}`,
      data: eventSchema.parse({ date: '2024', kind: 'site', title: 'x', ref }),
    }));
    const { errors } = checkContent(site({ resume, events }), { requireVerified: false });
    expect(errors.filter((e) => e.startsWith('event'))).toEqual([]);
  });

  it('rejects events that point at something not on the résumé', () => {
    const event = (ref: string) =>
      eventSchema.parse({ date: '2024', kind: 'project', title: 'x', ref });
    const content = site({ events: [{ id: 'e', data: event('projects/ghost') }] });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([
      'event e: "projects/ghost" isn\'t on the résumé',
    ]);
  });

  it('wants unique DM thread order and at most one AI thread', () => {
    const content = site({
      dmThreads: [
        { id: 'a', data: thread(1, true) },
        { id: 'b', data: thread(1) },
        { id: 'c', data: thread(2, true) },
      ],
    });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([
      'dm thread b: order 1 is already used',
      'only one DM thread can be the AI assistant',
    ]);
  });

  it('fails on a phone number anywhere: captions, stories, the résumé', () => {
    const content = site({
      resume: { ...emptyResume, location: 'Delhi, call +91 98765 43210' },
      posts: [post('a', 1, {}, 'Reach me at 98765-43210')],
    });
    expect(checkContent(content, { requireVerified: false }).errors).toEqual([
      'a phone number is in the content: "98765-43210"',
      'a phone number is in the content: "+91 98765 43210"',
    ]);
  });
});

describe('assertContent', () => {
  it('throws with every error listed', () => {
    const content = site({ posts: [post('a', 1, {}, '')] });
    expect(() => assertContent(content, { requireVerified: false }, () => {})).toThrow(
      'post a: caption is empty',
    );
  });

  it('logs unverified figures and returns the result', () => {
    const log = vi.fn();
    const content = site({
      figures: { ...site().figures, revenue: figure('$100K+', 'revenue', false) },
    });
    const result = assertContent(content, { requireVerified: false }, log);
    expect(result.unverified).toEqual(['revenue: $100K+ revenue']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('revenue: $100K+ revenue'));
  });

  it('stays quiet when everything is verified', () => {
    const log = vi.fn();
    assertContent(site(), { requireVerified: true }, log);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('schemas', () => {
  it('rejects a bio over 150 characters', () => {
    const result = profileSchema.safeParse({ ...site().profile, bio: 'x'.repeat(151) });
    expect(result.success).toBe(false);
  });

  it('rejects images without alt text', () => {
    const result = postSchema.safeParse({
      title: 't',
      order: 1,
      date: '2025-01-01',
      media: [{ type: 'image', src: '/a.webp', alt: '  ' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a figure with both or neither of value and count', () => {
    const base = { label: 'x', source: 's', verified: true };
    expect(figureSchema.safeParse({ ...base, value: '3', count: 'projects' }).success).toBe(false);
    expect(figureSchema.safeParse(base).success).toBe(false);
    expect(figureSchema.safeParse({ ...base, count: 'projects' }).success).toBe(true);
  });

  it('keeps Notes to 60 characters, as Instagram does', () => {
    const profile = site().profile;
    expect(profileSchema.safeParse({ ...profile, note: { text: 'x'.repeat(60) } }).success).toBe(
      true,
    );
    expect(profileSchema.safeParse({ ...profile, note: { text: 'x'.repeat(61) } }).success).toBe(
      false,
    );
  });

  it('rejects photos in a text-only highlight', () => {
    const result = highlightSchema.safeParse({
      label: 'Clinical',
      order: 3,
      textOnly: true,
      cover: { type: 'text', text: 'Ψ' },
      frames: [{ type: 'image', src: '/ward.webp', alt: 'Ward' }],
    });
    expect(result.success).toBe(false);
  });

  it('only accepts testimonials with a name and a source', () => {
    expect(
      testimonialSchema.safeParse({ quote: 'Great', name: 'A Person', source: 'LinkedIn' }).success,
    ).toBe(true);
    expect(
      testimonialSchema.safeParse({ quote: 'Great', name: '', source: 'LinkedIn' }).success,
    ).toBe(false);
    expect(testimonialSchema.safeParse({ quote: 'Great', name: 'A Person' }).success).toBe(false);
  });
});
