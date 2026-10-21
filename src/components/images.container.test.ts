import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import portrait from '../../tests/fixtures/media/test-portrait.jpg';
import StoryPage from '../pages/stories/[id].astro';
import Avatar from './Avatar.astro';
import Highlights from './profile/Highlights.astro';

// Content names photos by their path under src/assets/media/. The tests swap in one fixture so
// the image path runs without real photos in the repo.
vi.mock('../lib/media', () => ({
  mediaImage: () => portrait,
  mediaPlaceholder: (src: string) =>
    src.includes('cover')
      ? { color: '#123456', preview: 'data:image/webp;base64,AAAA' }
      : undefined,
}));
vi.mock('../lib/content', () => ({
  loadSiteContent: async () => ({
    profile: {
      username: 'test.person',
      displayName: 'Test Person',
      category: 'Developer',
      location: 'Delhi',
      avatar: { alt: 'Test Person' },
      links: { linkedin: 'https://www.linkedin.com/in/example' },
    },
    // The layout's search, notifications and create sheet read these; empty is enough here.
    resume: { projects: {}, skills: {} },
    figures: {},
    posts: [],
    highlights: [],
    reels: [],
    events: [],
    dmThreads: [],
  }),
}));

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create({ astroConfig: { site: 'http://localhost:4447' } });
});

/** Every <img> must come out of astro:assets: a resized file, never the raw content path. */
function expectOptimisedImages(html: string, count: number) {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  expect(imgs).toHaveLength(count);
  for (const img of imgs) {
    expect(img).not.toMatch(/src="[^"]*(people|photos)\//);
    expect(img).toMatch(/src="\/_image\?|src="\/@fs\//);
    expect(img).toMatch(/width="\d+"/);
    expect(img).toMatch(/height="\d+"/);
  }
  expect(html).toContain('type="image/avif"');
  expect(html).toContain('type="image/webp"');
  // Every photo sits in a Media box and fades in once loaded (src/scripts/media.ts).
  expect(html).toContain('class="media-box');
  for (const img of imgs) expect(img).toMatch(/class="[^"]*\bmedia-img\b/);
}

describe('photos go through astro:assets', () => {
  it('highlight covers', async () => {
    const html = await container.renderToString(Highlights, {
      props: {
        highlights: [
          {
            id: 'projects',
            data: {
              label: 'Projects',
              order: 1,
              inRow: true,
              textOnly: false,
              figures: [],
              cover: { type: 'image', src: 'people/cover.jpg', alt: 'Cover' },
              frames: [{ type: 'text', body: 'x' }],
            },
          },
        ],
      },
    });
    expectOptimisedImages(html, 1);
    // The cover class (and its scoped style) goes on the box, which carries the placeholder.
    expect(html).toMatch(/<span[^>]*class="media-box cover"/);
    expect(html).toMatch(/<span[^>]*class="media-box cover"[^>]*data-astro-cid-/);
    expect(html).toContain(
      '--media-color: #123456; --media-preview: url(data:image/webp;base64,AAAA)',
    );
  });

  it('the avatar photo, at its size and its 2x and 3x widths', async () => {
    const html = await container.renderToString(Avatar, {
      props: { size: 150, src: 'people/me.jpg', alt: 'Test Person', initials: 'TP' },
    });
    expectOptimisedImages(html, 1);
    expect(html).toMatch(/srcset="[^"]*150w[^"]*300w[^"]*450w/);
    expect(html).not.toContain('TP');
  });

  it('photo frames on the no-JavaScript stories page', async () => {
    const html = await container.renderToString(StoryPage, {
      request: new Request('http://localhost:4447/stories/projects/'),
      props: {
        highlight: {
          id: 'projects',
          data: {
            label: 'Projects',
            frames: [
              { type: 'image', src: 'photos/a.jpg', alt: 'A demo screen', caption: 'Demo' },
              { type: 'text', heading: 'Text', body: 'frame' },
            ],
          },
        },
      },
    });
    expectOptimisedImages(html, 1);
    expect(html).toContain('alt="A demo screen"');
    expect(html).toContain('<figcaption');
  });
});
