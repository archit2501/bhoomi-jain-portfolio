import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import NoteBubble from './NoteBubble.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('NoteBubble', () => {
  it('shows her note, labelled for screen readers', async () => {
    const html = await container.renderToString(NoteBubble, {
      props: { note: { text: 'Open to full stack roles', until: '2099-12' } },
    });
    expect(html).toContain('Open to full stack roles');
    expect(html).toContain('Note: </span>');
    expect(html).toContain('data-until="2099-12"');
  });

  it('leaves an expired note out of the page entirely', async () => {
    const html = await container.renderToString(NoteBubble, {
      props: { note: { text: 'Shipping v1', until: '2020-01' } },
    });
    expect(html).not.toContain('Shipping v1');
  });
});
