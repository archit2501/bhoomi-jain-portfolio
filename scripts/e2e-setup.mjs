/**
 * Before the end-to-end tests start the preview server: give it the local Turnstile test secret
 * (from .dev.vars.example, unless a .dev.vars exists) and a fresh local database with the
 * migrations applied, so like counts and comments start from nothing on every run.
 * Local data only (.wrangler/state); production is never touched.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';

if (!existsSync('.dev.vars')) {
  copyFileSync('.dev.vars.example', '.dev.vars');
} else {
  // Add any secret the example has gained since this .dev.vars was made; keep the rest as is.
  const have = new Set(
    readFileSync('.dev.vars', 'utf8')
      .split('\n')
      .map((line) => line.split('=')[0].trim()),
  );
  const missing = readFileSync('.dev.vars.example', 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line) && !have.has(line.split('=')[0]));
  if (missing.length) appendFileSync('.dev.vars', `\n${missing.join('\n')}\n`);
}

rmSync('.wrangler/state/v3/d1', { recursive: true, force: true });
execFileSync(
  'npx',
  ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '-c', 'wrangler.jsonc'],
  {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, CI: 'true' },
  },
);
console.log('e2e: local database migrated, Turnstile test secret in place');
