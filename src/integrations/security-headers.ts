/**
 * After the build, appends the security headers (src/lib/security-headers.ts) to
 * dist/client/_headers, with a Content-Security-Policy that lists the hash of every inline script
 * in the built pages. The hashes come from the HTML that ships, so a changed script can't fall out
 * of the policy. Workers Static Assets applies the file to every static response.
 */
import type { AstroIntegration } from 'astro';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersRule } from '../lib/security-headers';

/** A preview build: `CLOUDFLARE_ENV=preview` targets the preview Worker (wrangler.jsonc). */
export function isPreviewBuild(env: Record<string, string | undefined> = process.env): boolean {
  return env.CLOUDFLARE_ENV === 'preview';
}

const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
/** Scripts the browser runs: no type, a JavaScript type or a module. JSON data blocks never run. */
const EXECUTABLE = /^(?:|module|(?:text|application)\/(?:java|ecma)script)$/i;

/** The CSP hash ("sha256-…") of every inline script the browser would run in this HTML. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes, body] of html.matchAll(INLINE_SCRIPT)) {
    if (/\ssrc\s*=/i.test(` ${attributes}`)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attributes)?.[1] ?? '';
    if (!EXECUTABLE.test(type)) continue;
    hashes.push(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
  return hashes;
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Hashes every built page's inline scripts and appends the rule; returns how many hashes. */
export async function writeSecurityHeaders(
  clientDir: string,
  options: { preview: boolean },
): Promise<number> {
  const hashes = new Set<string>();
  for (const file of await htmlFiles(clientDir)) {
    for (const hash of inlineScriptHashes(await readFile(file, 'utf8'))) hashes.add(hash);
  }
  const path = join(clientDir, '_headers');
  const existing = await readFile(path, 'utf8').catch(() => '');
  const rule = headersRule({ scriptHashes: [...hashes].sort(), preview: options.preview });
  await writeFile(path, `${existing.trimEnd()}\n\n${rule}\n`.trimStart());
  return hashes.size;
}

export default function securityHeaders(): AstroIntegration {
  let clientDir = '';
  return {
    name: 'security-headers',
    hooks: {
      'astro:config:done': ({ config }) => {
        clientDir = fileURLToPath(config.build.client);
      },
      'astro:build:done': async ({ logger }) => {
        const preview = isPreviewBuild();
        const count = await writeSecurityHeaders(clientDir, { preview });
        logger.info(
          `Security headers in _headers: ${count} inline script hashes${preview ? ', noindex (preview)' : ''}.`,
        );
      },
    },
  };
}
