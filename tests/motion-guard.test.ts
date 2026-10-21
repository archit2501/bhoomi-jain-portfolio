import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Touch screens have no hover: a :hover style there sticks after a tap. Every :hover rule must
 * sit inside @media (hover: hover). Scans the CSS in src/ (Astro <style> blocks and .css files).
 */
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(astro|css)$/.test(name) ? [path] : [];
  });
}

const styles = (path: string) => {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.css')) return [text];
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
};

/** Selectors using :hover whose enclosing at-rules don't include (hover: hover). O(n). */
export function bareHovers(css: string): string[] {
  const found: string[] = [];
  const stack: string[] = [];
  let buffer = '';
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      const head = buffer.trim();
      if (head.includes(':hover') && !stack.some((s) => /hover:\s*hover/.test(s))) {
        found.push(head.replace(/\s+/g, ' '));
      }
      stack.push(head);
      buffer = '';
    } else if (char === '}') {
      stack.pop();
      buffer = '';
    } else if (char === ';') {
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return found;
}

describe('hover styles', () => {
  it('only apply on devices that can hover', () => {
    const found = files(SRC).flatMap((path) =>
      styles(path).flatMap((css) => bareHovers(css).map((s) => `${relative(SRC, path)}: ${s}`)),
    );
    expect(found).toEqual([]);
  });

  it('the check itself tells wrapped hovers from bare ones', () => {
    const css = `
      .a:hover { color: red; }
      @media (hover: hover) { .b:hover { color: red; } }
      @media (min-width: 768px) { .c:hover { color: red; } }
      .d { color: red; }`;
    expect(bareHovers(css)).toEqual(['.a:hover', '.c:hover']);
  });
});
