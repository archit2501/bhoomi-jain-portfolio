import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import { stickerSchema } from '../../lib/content-schema';
import Sticker from './Sticker.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (input: unknown) =>
  container.renderToString(Sticker, { props: { sticker: stickerSchema.parse(input) } });

describe('Sticker', () => {
  it('renders a link sticker as a new-tab link showing the domain', async () => {
    const html = await render({ type: 'link', href: 'https://www.linkedin.com/in/bhoomi21' });
    expect(html).toMatch(/<a[^>]+href="https:\/\/www\.linkedin\.com\/in\/bhoomi21"/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/<span[^>]*>linkedin\.com<\/span>/);
  });

  it('renders a mention as a link to its post, with the @', async () => {
    const html = await render({ type: 'mention', name: 'TheMobiAdz', href: '/p/themobiadz/' });
    expect(html).toMatch(/<a[^>]+href="\/p\/themobiadz\/"/);
    expect(html).not.toContain('target=');
    expect(html).toContain('@TheMobiAdz');
  });

  it('renders location and code stickers as plain text, placed and tilted', async () => {
    const location = await render({ type: 'location', name: 'Delhi, India', x: 30, rotate: -4 });
    expect(location).not.toContain('<a');
    expect(location).toContain('Delhi, India');
    expect(location).toContain('--x: 30%; --y: 80%; --rotate: -4deg');
    const code = await render({ type: 'code', code: "stack = ['React']" });
    expect(code).toMatch(/<code[^>]+data-sticker="code"/);
    expect(code).toContain('stack = [&#39;React&#39;]');
  });
});
