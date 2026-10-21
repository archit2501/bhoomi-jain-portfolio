/**
 * Worker integration tests run against real local bindings: wrangler's platform proxy starts
 * workerd with the D1 database, KV namespaces and rate limiters declared in wrangler.jsonc, in
 * memory, and the migrations in migrations/ are applied to the fresh database. Test-only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { D1Like } from './db';
import type { CounterStore } from './guard';
import type { WorkerBindings } from './platform';

/** Every binding present, and the flags writable, so tests can flip switches. */
export type LocalBindings = Required<Omit<WorkerBindings, 'TURNSTILE_SECRET' | 'FLAGS'>> & {
  FLAGS: CounterStore;
};

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Splits a migration into statements: D1 runs one statement per prepare. */
export function sqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function applyMigrations(db: D1Like): Promise<number> {
  const dir = join(ROOT, 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let count = 0;
  for (const file of files) {
    const statements = sqlStatements(readFileSync(join(dir, file), 'utf8'));
    await db.batch(statements.map((s) => db.prepare(s)));
    count += statements.length;
  }
  return count;
}

export async function localBindings(): Promise<{
  env: LocalBindings;
  dispose: () => Promise<void>;
}> {
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<LocalBindings>({
    configPath: join(ROOT, 'wrangler.jsonc'),
    persist: false,
  });
  await applyMigrations(proxy.env.DB);
  return { env: proxy.env, dispose: proxy.dispose };
}
