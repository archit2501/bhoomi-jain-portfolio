import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pages, pageScriptBytes } from '../scripts/js-budget.mjs';

function site(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'budget-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe('js budget', () => {
  const shared = 'export const shared = 1;'.repeat(20);
  const root = site({
    'index.html':
      '<script type="module" src="/_astro/a.js"></script><script>inline()</script><script type="application/ld+json">{"x":1}</script>',
    'p/x/index.html': '<script type="module" src="/_astro/b.js"></script>',
    '_astro/a.js':
      'import "./shared.js"; import { shared } from "./shared.js"; console.log(shared);',
    '_astro/b.js': 'console.log(2);',
    '_astro/shared.js': shared,
  });

  it('finds every page in the build', () => {
    expect(pages(root).sort()).toEqual(['index.html', 'p/x/index.html']);
  });

  it('counts a page’s scripts and their imports once each, plus inline code, gzipped; not JSON', () => {
    const gz = (s: string) => gzipSync(s).length;
    expect(pageScriptBytes(root, 'index.html')).toBe(
      gz('import "./shared.js"; import { shared } from "./shared.js"; console.log(shared);') +
        gz(shared) +
        gz('inline()'),
    );
    expect(pageScriptBytes(root, 'p/x/index.html')).toBe(gz('console.log(2);'));
  });
});
