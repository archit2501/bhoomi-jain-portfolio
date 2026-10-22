/**
 * The production smoke test (task 5.2.2): after a deploy, the live site's pages, files and API
 * answer, the database is up, and every off switch is on. Any failure exits 1 and says how to
 * roll back.
 *
 *   BASE=https://<her domain> npm run smoke:prod
 */
import { pathToFileURL } from 'node:url';

/** What must answer, and how to tell it's right. */
export const CHECKS = [
  { path: '/', type: 'text/html' },
  { path: '/reels/', type: 'text/html' },
  { path: '/p/smartblog-ai/', type: 'text/html' },
  { path: '/stories/projects/', type: 'text/html' },
  { path: '/direct/', type: 'text/html' },
  { path: '/insights/', type: 'text/html' },
  { path: '/sitemap.xml', type: 'xml' },
  { path: '/og/default.png', type: 'image/png' },
  { path: '/manifest.webmanifest', type: 'json' },
  { path: '/contact.vcf', type: 'vcard' },
  { path: '/sw.js', type: 'javascript' },
  {
    path: '/api/health',
    type: 'json',
    /** The database answers, and no switch is off. */
    check: (body) => {
      const flags = Object.entries(body.flags ?? {});
      const off = flags.filter(([, on]) => !on).map(([name]) => name);
      if (!body.db) return 'the database does not answer';
      if (!flags.length) return 'no switches reported';
      return off.length ? `switched off: ${off.join(', ')}` : null;
    },
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs every check against `base`; returns the failures. The first is retried while a deploy settles. */
export async function smoke(
  base,
  { fetch: get = fetch, retries = 6, delayMs = 10_000, log = console.log } = {},
) {
  const failures = [];
  for (const [i, { path, type, check }] of CHECKS.entries()) {
    let problem = null;
    for (let attempt = 0; attempt <= (i === 0 ? retries : 1); attempt++) {
      try {
        const res = await get(new URL(path, base), { redirect: 'follow' });
        const contentType = res.headers.get('content-type') ?? '';
        if (res.status !== 200) problem = `answered ${res.status}`;
        else if (!contentType.includes(type))
          problem = `is ${contentType || 'untyped'}, not ${type}`;
        else problem = check ? check(await res.json()) : null;
      } catch (error) {
        problem = `failed: ${error instanceof Error ? error.message : error}`;
      }
      if (!problem) break;
      if (attempt < (i === 0 ? retries : 1)) await wait(delayMs);
    }
    log(`${problem ? '✗' : '✓'} ${path}${problem ? ` ${problem}` : ''}`);
    if (problem) failures.push(`${path} ${problem}`);
  }
  return failures;
}

async function main() {
  const base = process.env.BASE ?? process.env.SITE_URL;
  if (!base) {
    console.error('smoke: set BASE (or SITE_URL) to the site, e.g. BASE=https://example.com');
    process.exit(2);
  }
  const failures = await smoke(base);
  if (failures.length) {
    console.error(
      `::error::${failures.length} check(s) failed on ${base}. Roll back with: npx wrangler rollback`,
    );
    process.exit(1);
  }
  console.log(`smoke: all ${CHECKS.length} checks passed on ${base}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
