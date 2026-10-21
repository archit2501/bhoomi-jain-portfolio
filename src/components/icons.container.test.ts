import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Icon from './Icon.astro';
import { ICON_NAMES } from './icon-names';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('Icon', () => {
  it.each(ICON_NAMES)('"%s" has an outline and a filled glyph that differ', async (name) => {
    const outline = await container.renderToString(Icon, { props: { name } });
    const filled = await container.renderToString(Icon, { props: { name, filled: true } });
    for (const svg of [outline, filled]) {
      expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 256 256"/);
      expect(svg).toContain('<path');
    }
    expect(filled).not.toBe(outline);
  });

  it('is decorative unless it has a label, and takes its size', async () => {
    const decorative = await container.renderToString(Icon, { props: { name: 'home', size: 20 } });
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).toMatch(/width="20"[^>]*height="20"|height="20"[^>]*width="20"/);
    const labelled = await container.renderToString(Icon, {
      props: { name: 'close', label: 'Close' },
    });
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Close"');
    expect(labelled).not.toContain('aria-hidden');
  });
});
