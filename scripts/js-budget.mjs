/**
 * The JavaScript budget (task 5.2.1): no page may ship more than 40 KB of script, gzipped.
 * For every page in the build, it adds up the module scripts the page loads, everything they
 * import, and its inline scripts, then fails if any page is over.
 *
 *   node scripts/js-budget.mjs [dist/client] [40]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Every .html page under the build, as paths relative to it. */
export function pages(root, dir = root) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(root, path);
    return name.endsWith('.html') ? [relative(root, path)] : [];
  });
}

/** A page's script, gzipped: its module scripts and their imports, once each, and inline code. */
export function pageScriptBytes(root, page) {
  const html = readFileSync(join(root, page), 'utf8');
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(join(root, file), 'utf8');
    for (const [, spec] of source.matchAll(
      /(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g,
    )) {
      visit(posix.normalize(posix.join(posix.dirname(file), spec)));
    }
  };
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"/g)) visit(src);
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attrs]) => !/type="application\/(?:ld\+)?json"/.test(attrs))
    .map(([, , code]) => code)
    .join('');
  let bytes = inline ? gzipSync(inline).length : 0;
  for (const file of seen) bytes += gzipSync(readFileSync(join(root, file))).length;
  return bytes;
}

function main() {
  const [root = 'dist/client', limitKb = '40'] = process.argv.slice(2);
  const limit = Number(limitKb) * 1024;
  const results = pages(root)
    .map((page) => ({ page, bytes: pageScriptBytes(root, page) }))
    .sort((a, b) => b.bytes - a.bytes);
  const over = results.filter((r) => r.bytes > limit);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`js-budget: ${results.length} pages; the heaviest:`);
  for (const r of results.slice(0, 5)) console.log(`  ${kb(r.bytes).padStart(8)}  ${r.page}`);
  if (over.length) {
    console.error(`js-budget: ${over.length} page(s) over ${limitKb} KB gzipped:`);
    for (const r of over) console.error(`  ${kb(r.bytes)}  ${r.page}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
