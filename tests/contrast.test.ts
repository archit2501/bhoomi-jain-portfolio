import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, relativeLuminance } from '../src/lib/color';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} block in tokens.css`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

function tokens(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const light = tokens(block(':root {'));
const darkMedia = { ...light, ...tokens(block(":root:not([data-theme='light'])")) };
const darkToggle = { ...light, ...tokens(block(":root[data-theme='dark']")) };

describe('color math', () => {
  it('parses short and long hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('0b7a75')).toEqual([11, 122, 117]);
    expect(() => parseHex('teal')).toThrow('Not a hex colour');
  });

  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
  });
});

describe('design tokens', () => {
  it('story text passes 4.5:1 across the whole story canvas', () => {
    expect(contrastRatio(light['on-story'], light['story-start'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light['on-story'], light['story-end'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light['on-story'], light['tile-slate'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light['on-story'], light.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('defines the same dark values for the system setting and the toggle', () => {
    expect(darkToggle).toEqual(darkMedia);
  });

  for (const [name, t] of [
    ['light', light],
    ['dark', darkMedia],
  ] as const) {
    describe(`${name} theme`, () => {
      it('text and secondary text pass 4.5:1 on every surface', () => {
        for (const surface of ['bg', 'bg-secondary', 'bg-elevated']) {
          expect(contrastRatio(t.text, t[surface])).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(t['text-secondary'], t.bg)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent text passes 4.5:1 and button text passes 4.5:1 on the accent', () => {
        expect(contrastRatio(t['accent-text'], t.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t['on-accent'], t['accent-hover'])).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(t['button-secondary-text'], t['button-secondary']),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it('the story ring and primary button stand out 3:1 from the page', () => {
        expect(contrastRatio(t['ring-start'], t.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t['ring-end'], t.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
