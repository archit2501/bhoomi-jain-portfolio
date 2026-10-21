/**
 * Before the end-to-end tests start the preview server: give it the local Turnstile test secret
 * (from .dev.vars.example, unless a .dev.vars exists) and a fresh local database with the
 * migrations applied, so like counts and comments start from nothing on every run.
 * Local data only (.wrangler/state); production is never touched.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';

if (!existsSync('.dev.vars')) copyFileSync('.dev.vars.example', '.dev.vars');

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
