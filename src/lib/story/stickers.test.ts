import { describe, expect, it } from 'vitest';
import { stickerSchema } from '../content-schema';
import { linkDomain, stickerStyle, stickerText } from './stickers';

const parse = (input: unknown) => stickerSchema.parse(input);

describe('stickerText', () => {
  it('shows a link as its domain unless it has its own words', () => {
    expect(stickerText(parse({ type: 'link', href: 'https://www.linkedin.com/in/bhoomi21' }))).toBe(
      'linkedin.com',
    );
    expect(
      stickerText(parse({ type: 'link', href: 'https://example.com/x', label: 'My work' })),
    ).toBe('My work');
  });

  it('prefixes a mention with @ and shows locations and code as written', () => {
    expect(
      stickerText(parse({ type: 'mention', name: 'TheMobiAdz', href: '/p/themobiadz/' })),
    ).toBe('@TheMobiAdz');
    expect(stickerText(parse({ type: 'location', name: 'Delhi, India' }))).toBe('Delhi, India');
    expect(stickerText(parse({ type: 'code', code: "const stack = ['React'];" }))).toBe(
      "const stack = ['React'];",
    );
  });
});

describe('stickerSchema', () => {
  it('places a sticker low and centred, untilted, by default', () => {
    expect(parse({ type: 'location', name: 'Delhi, India' })).toMatchObject({
      x: 50,
      y: 80,
      rotate: 0,
    });
  });

  it('keeps stickers inside the frame and only slightly tilted', () => {
    expect(() => parse({ type: 'location', name: 'Delhi', x: 2 })).toThrow();
    expect(() => parse({ type: 'location', name: 'Delhi', y: 5 })).toThrow();
    expect(() => parse({ type: 'location', name: 'Delhi', rotate: 45 })).toThrow();
  });

  it('only mentions pages on this site, and code stays on one short line', () => {
    expect(() =>
      parse({ type: 'mention', name: 'x', href: 'https://instagram.com/someone' }),
    ).toThrow();
    expect(() => parse({ type: 'code', code: 'a\nb' })).toThrow();
    expect(() => parse({ type: 'code', code: 'x'.repeat(61) })).toThrow();
  });
});

describe('helpers', () => {
  it('linkDomain drops www', () => {
    expect(linkDomain('https://www.example.com/a')).toBe('example.com');
    expect(linkDomain('https://github.com/a')).toBe('github.com');
  });

  it('stickerStyle sets the placement as custom properties', () => {
    expect(stickerStyle({ x: 30, y: 70, rotate: -4 })).toBe('--x: 30%; --y: 70%; --rotate: -4deg');
  });
});
