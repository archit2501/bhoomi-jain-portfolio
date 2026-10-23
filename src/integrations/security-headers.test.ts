import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inlineScriptHashes, isPreviewBuild, writeSecurityHeaders } from './security-headers';

const sha = (body: string) => `sha256-${createHash('sha256').update(body).digest('base64')}`;

describe('inlineScriptHashes', () => {
  it('hashes the inline scripts a browser runs, exactly as written', () => {
    const html = `<script>a()</script><script type="module">\n  b();\n</script>
      <script type="text/javascript">c()</script>`;
    expect(inlineScriptHashes(html)).toEqual([sha('a()'), sha('\n  b();\n'), sha('c()')]);
  });

  it('skips scripts loaded by URL and data blocks that never run', () => {
    const html = `<script type="module" src="/_astro/a.js"></script>
      <script type="application/ld+json">{"@type":"Person"}</script>
      <script type="application/json" data-search-index>[]</script>`;
    expect(inlineScriptHashes(html)).toEqual([]);
  });
});

describe('isPreviewBuild', () => {
  it('is true only when the build targets the preview Worker', () => {
    expect(isPreviewBuild({ CLOUDFLARE_ENV: 'preview' })).toBe(true);
    expect(isPreviewBuild({ CLOUDFLARE_ENV: 'production' })).toBe(false);
    expect(isPreviewBuild({})).toBe(false);
  });
});

describe('writeSecurityHeaders', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'headers-'));
    await mkdir(join(dir, 'p', 'post'), { recursive: true });
    await writeFile(join(dir, 'index.html'), '<script>boot()</script><script>one()</script>');
    await writeFile(join(dir, 'p', 'post', 'index.html'), '<script>boot()</script>');
    await writeFile(join(dir, 'p', 'post', 'note.js'), 'not()');
    await writeFile(join(dir, '_headers'), '/sw.js\n  Cache-Control: no-cache\n');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('lists each inline script once, from every page, after the rules already there', async () => {
    expect(await writeSecurityHeaders(dir, { preview: false })).toBe(2);
    const file = await readFile(join(dir, '_headers'), 'utf8');
    expect(file.startsWith('/sw.js\n  Cache-Control: no-cache\n\n')).toBe(true);
    const csp = /Content-Security-Policy: (.+)/.exec(file)?.[1] ?? '';
    expect(csp).toContain(`'${sha('boot()')}'`);
    expect(csp).toContain(`'${sha('one()')}'`);
    expect(csp).not.toContain(sha('not()'));
    expect(file).not.toContain('X-Robots-Tag');
  });

  it('adds noindex for a preview build', async () => {
    await writeSecurityHeaders(dir, { preview: true });
    expect(await readFile(join(dir, '_headers'), 'utf8')).toContain('X-Robots-Tag: noindex');
  });

  it('writes the file when the build made none', async () => {
    await rm(join(dir, '_headers'));
    await writeSecurityHeaders(dir, { preview: false });
    expect(await readFile(join(dir, '_headers'), 'utf8')).toMatch(/^# Security headers/);
  });
});
