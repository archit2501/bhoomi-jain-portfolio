import { describe, expect, it } from 'vitest';
import { escapeXml, ogSvg, svgInner, wrapText } from './og';

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('$100K+', 18, 2)).toEqual(['$100K+']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText('Content to dispatch, 5+ regions', 21, 2)).toEqual([
      'Content to dispatch,',
      '5+ regions',
    ]);
  });

  it('cuts to the line limit with an ellipsis', () => {
    expect(wrapText('one two three four five six', 7, 2)).toEqual(['one two', 'three…']);
  });

  it('never splits a word that is longer than a line', () => {
    expect(wrapText('supercalifragilistic word', 5, 3)).toEqual(['supercalifragilistic', 'word']);
  });

  it('returns no lines for empty text', () => {
    expect(wrapText('   ', 10, 2)).toEqual([]);
  });
});

describe('escapeXml', () => {
  it('escapes the five XML specials', () => {
    expect(escapeXml(`A & B <c> "d" 'e'`)).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });
});

describe('ogSvg', () => {
  const card = {
    headline: 'Full Stack & APIs',
    detail: 'in revenue from 7+ sales',
    footer: 'Bhoomi Jain · Full Stack Developer',
    tone: 1 as const,
    wordmark: '<path d="M2 3v21" stroke="currentColor"/>',
  };

  it('draws a 1200×630 card with escaped text and a white wordmark', () => {
    const svg = ogSvg(card);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('Full Stack &amp; APIs');
    expect(svg).toContain('in revenue from 7+ sales');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).not.toContain('currentColor');
  });

  it('uses each tone and works without a detail line', () => {
    expect(ogSvg({ ...card, tone: 2, detail: undefined })).toContain('#2b3036');
    expect(ogSvg({ ...card, tone: 3 })).toContain('#0b7a75');
  });

  it('shrinks a two-line headline', () => {
    expect(ogSvg({ ...card, headline: 'Content to dispatch, 5+ regions' })).toContain(
      'font-size="88"',
    );
  });
});

describe('svgInner', () => {
  it('strips the outer svg element', () => {
    expect(svgInner('<svg viewBox="0 0 1 1" a="b">\n<path d="x"/>\n</svg>\n')).toBe(
      '\n<path d="x"/>\n',
    );
  });
});
