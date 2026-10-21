import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import portrait from '../../../tests/fixtures/media/test-portrait.jpg';
import { postSchema, profileSchema } from '../../lib/content-schema';
import PostView from './PostView.astro';

vi.mock('../../lib/media', () => ({
  mediaImage: () => portrait,
  mediaPlaceholder: () => undefined,
}));
// No content collection in the test: the caption falls back to the raw body.
vi.mock('astro:content', () => ({ getEntry: async () => undefined, render: async () => ({}) }));

const profile = profileSchema.parse({
  username: 'test.person',
  displayName: 'Test Person',
  category: 'Developer',
  bio: 'Bio',
  location: 'Delhi',
  avatar: { alt: 'Test Person' },
  stats: ['a', 'b', 'c'],
  links: { linkedin: 'https://www.linkedin.com/in/example' },
});

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('PostView', () => {
  it('pins tags on a screenshot, each opening a search, behind a toggle', async () => {
    const data = postSchema.parse({
      title: 'Dashboard',
      kind: 'log',
      order: 1,
      tldr: 'One line.',
      media: [
        {
          type: 'image',
          src: 'shot.png',
          alt: 'The dashboard',
          tags: [{ label: 'React Query', x: 30, y: 40 }],
        },
      ],
    });
    const html = await container.renderToString(PostView, {
      props: { post: { id: 'dash', data, body: 'Caption text' }, profile, variant: 'page' },
    });
    expect(html).toContain('href="/explore/?q=React%20Query"');
    expect(html).toContain('left: 30%; top: 40%');
    expect(html).toMatch(/class="tags-toggle"[^>]*aria-pressed="false"/);
    expect(html).toContain('One line.');
    expect(html).toContain('--vt-name: post-dash');
  });
});
