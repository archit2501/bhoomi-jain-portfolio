import { describe, expect, it } from 'vitest';
import { postSchema } from './content-schema';
import { hasPhoto, slideFace, slideText, type Slide } from './slides';

const text: Slide = { type: 'text', headline: '~45%', detail: 'fewer calls' };
const diagram = postSchema.parse({
  title: 't',
  kind: 'log',
  order: 1,
  media: [
    {
      type: 'diagram',
      title: 'How it fits together',
      nodes: [
        { id: 'a', label: 'React SPA', detail: 'React Query cache' },
        { id: 'b', label: 'Express API' },
      ],
      edges: [{ from: 'a', to: 'b', label: 'REST + JWT' }],
    },
  ],
}).media[0];
const code: Slide = { type: 'code', lang: 'ts', code: 'const a = 1;', caption: 'The cache key' };
const image: Slide = {
  type: 'image',
  src: 'a.png',
  alt: 'A',
  tags: [{ label: 'React', x: 10, y: 20 }],
};

describe('slideText', () => {
  it('collects the words each kind of slide shows', () => {
    expect(slideText(text)).toBe('~45% fewer calls');
    expect(slideText(diagram)).toBe(
      'How it fits together React SPA React Query cache Express API REST + JWT',
    );
    expect(slideText(code)).toBe('The cache key');
    expect(slideText({ ...code, caption: undefined })).toBe('');
    expect(slideText(image)).toBe('React');
  });
});

describe('slideFace', () => {
  it('gives text, diagram and code slides a tile face', () => {
    expect(slideFace(text)).toEqual({ headline: '~45%', detail: 'fewer calls' });
    expect(slideFace(diagram as Exclude<Slide, { type: 'image' }>)).toEqual({
      headline: 'How it fits together',
      detail: 'Architecture',
    });
    expect(slideFace({ type: 'code', lang: 'ts', code: 'x' })).toEqual({
      headline: 'Code',
      detail: 'ts',
    });
  });
});

describe('schema and hasPhoto', () => {
  it('rejects a diagram edge to a node it does not have', () => {
    const result = postSchema.safeParse({
      title: 't',
      kind: 'log',
      order: 1,
      media: [
        {
          type: 'diagram',
          title: 'x',
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          edges: [{ from: 'a', to: 'ghost' }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('caps code slides at 18 lines and carousels at 20 slides', () => {
    const base = { title: 't', kind: 'log', order: 1 };
    const long = { type: 'code', lang: 'ts', code: Array(19).fill('x').join('\n') };
    expect(postSchema.safeParse({ ...base, media: [long] }).success).toBe(false);
    expect(postSchema.safeParse({ ...base, media: Array(21).fill(text) }).success).toBe(false);
    expect(postSchema.safeParse({ ...base, media: Array(20).fill(text) }).success).toBe(true);
  });

  it('counts only real photos or screens as a photo', () => {
    expect(hasPhoto({ data: { media: [text, diagram] } as never })).toBe(false);
    expect(hasPhoto({ data: { media: [text, image] } as never })).toBe(true);
  });
});
