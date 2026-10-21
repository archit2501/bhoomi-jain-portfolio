import { describe, expect, it, vi } from 'vitest';
import { assertContent, checkContent, type SiteContent } from './content-guards';
import {
  highlightSchema,
  postSchema,
  profileSchema,
  testimonialSchema,
  type Figure,
} from './content-schema';

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
