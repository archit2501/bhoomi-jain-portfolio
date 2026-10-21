/**
 * The "Ask my AI" eval: the 30 questions in evals/ai-questions.json, asked of the real Claude API
 * with exactly the request the site sends (src/lib/server/ai.ts), graded in code (evals/grade.ts).
 *
 * It calls the paid API, so it only runs when asked for, with a key:
 *
 *   AI_EVAL=1 ANTHROPIC_API_KEY=… npm run eval:ai
 *
 * It prints an estimate before the first question and the actual cost at the end (a full run is
 * well under one US cent at Haiku 5.5's prices). `npm test` never runs it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postSchema } from '../src/lib/content-schema';
import { AI_MODEL, buildRequest } from '../src/lib/server/ai';
import { aiDocuments, systemPrompt } from '../src/lib/server/ai-context';
import { posts, profile, resume } from '../tests/e2e/fixtures';
import cases from './ai-questions.json';
import { cost, estimate, grade, type EvalCase, type Usage } from './grade';

const key = process.env.ANTHROPIC_API_KEY;
const run = process.env.AI_EVAL === '1' && Boolean(key);

// The same documents and rules as the site: posts through their schema, in grid order.
const documents = aiDocuments(
  resume,
  posts.map((p) => ({ id: p.id, data: postSchema.parse(p.data), body: p.body })),
);
const system = systemPrompt(profile.displayName);
const list = cases.cases as EvalCase[];

describe.skipIf(!run)(`Ask my AI eval (${AI_MODEL}, calls the paid API)`, () => {
  const client = new Anthropic({ apiKey: key });
  const spent: Usage[] = [];
  const failed: string[] = [];

  beforeAll(() => {
    const prefix = system.length + documents.reduce((n, d) => n + d.text.length + 40, 0);
    console.log(
      `Asking ${list.length} questions of ${AI_MODEL}: about $${estimate(prefix, list.length).toFixed(4)}.`,
    );
  });

  afterAll(() => {
    const total = spent.reduce((n, u) => n + cost(u), 0);
    const reads = spent.reduce((n, u) => n + (u.cache_read_input_tokens ?? 0), 0);
    console.log(
      `${list.length - failed.length}/${list.length} passed. Spent $${total.toFixed(4)} ` +
        `(${reads} cached input tokens read).${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`,
    );
  });

  // One at a time: the first answer writes the cached prefix, the rest read it.
  for (const test of list) {
    it(
      test.id,
      async () => {
        const response = await client.messages.create(
          buildRequest({ documents, system }, [{ role: 'user', content: test.question }]),
        );
        spent.push(response.usage);
        const text = response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('');
        const cited = response.content.reduce(
          (n, block) => n + (block.type === 'text' ? (block.citations?.length ?? 0) : 0),
          0,
        );
        const problems = grade(test, { text, cited, stopReason: response.stop_reason });
        if (problems.length) failed.push(test.id);
        expect(problems, `${test.question}\n→ ${text}`).toEqual([]);
      },
      60_000,
    );
  }
});

describe.skipIf(run)('Ask my AI eval', () => {
  it.skip('needs AI_EVAL=1 and ANTHROPIC_API_KEY (it calls the paid API)', () => {});
});
