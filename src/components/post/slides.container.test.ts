import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import portrait from '../../../tests/fixtures/media/test-portrait.jpg';
import CodeSlide from './CodeSlide.astro';
import DiagramSlide from './DiagramSlide.astro';

vi.mock('../../lib/media', () => ({
  mediaImage: () => portrait,
  mediaPlaceholder: () => undefined,
}));

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('DiagramSlide', () => {
  it('draws one box per node and one arrow per edge, with a text alternative', async () => {
    const html = await container.renderToString(DiagramSlide, {
      props: {
        id: 't',
        title: 'How it fits',
        nodes: [
          { id: 'a', label: 'React SPA' },
          { id: 'b', label: 'Express API', detail: 'JWT' },
        ],
        edges: [{ from: 'a', to: 'b', label: 'REST' }],
      },
    });
    expect(html.match(/class="node layer-\d+"/g)).toHaveLength(2);
    expect(html.match(/<line /g)).toHaveLength(1);
    expect(html).toContain('aria-label="How it fits: React SPA to Express API (REST)"');
    expect(html).toContain('marker-end="url(#arrow-t)"');
  });
});

describe('CodeSlide', () => {
  it('highlights real code as text, never as an image', async () => {
    const html = await container.renderToString(CodeSlide, {
      props: { code: 'const cached = useQuery(key, fetchPost);', lang: 'ts', caption: 'The cache' },
    });
    expect(html).toContain('<pre');
    expect(html).toContain('useQuery');
    expect(html).not.toContain('<img');
    expect(html).toContain('<figcaption');
  });
});
