import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

// Bhoomi signs off on docs/content-review.md (task 5.2.1); it must say what the site says.
describe('the content sign-off sheet', () => {
  it('matches the content: run `npm run content:review` after changing it', async () => {
    const fresh = execFileSync('node', ['scripts/content-review.mjs'], { encoding: 'utf8' });
    const options = (await resolveConfig('docs/content-review.md')) ?? {};
    const formatted = await format(fresh, { ...options, parser: 'markdown' });
    expect(readFileSync('docs/content-review.md', 'utf8')).toBe(formatted);
  });

  it('never carries a phone number', () => {
    expect(readFileSync('docs/content-review.md', 'utf8')).not.toMatch(/\+?\d[\d\s-]{9,}\d/);
  });
});
