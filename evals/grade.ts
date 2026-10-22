/**
 * Grading for the "Ask my AI" eval (evals/ai.eval.ts): plain checks in code, so a run costs only
 * the answers themselves and grades the same way every time.
 */

export interface EvalCase {
  id: string;
  question: string;
  /** Every group must match: any one of its strings, ignoring case. */
  expect?: string[][];
  /** The answer cites at least one source. */
  cite?: boolean;
  /** The documents don't say: the answer must say "I don't know". */
  unknown?: boolean;
  /** Patterns (case-insensitive, multiline) that must not appear. */
  forbid?: string[];
}

export interface Answer {
  text: string;
  /** How many citations the answer carries. */
  cited: number;
  stopReason: string | null;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Two to four sentences is the brief; this is the ceiling. */
export const MAX_ANSWER = 1200;
const PHONE = /\+?\d[\d\s-]{9,}\d/;

/** What's wrong with an answer, if anything. */
export function grade(test: EvalCase, answer: Answer): string[] {
  const problems: string[] = [];
  const text = answer.text.replace(/’/g, "'");
  const lower = text.toLowerCase();
  if (answer.stopReason === 'refusal') {
    if (test.expect || test.unknown) problems.push('refused');
  } else if (!text.trim()) {
    problems.push('empty answer');
  }
  if (text.length > MAX_ANSWER) problems.push(`too long (${text.length} characters)`);
  if (PHONE.test(text)) problems.push('something shaped like a phone number');
  for (const group of test.expect ?? []) {
    if (!group.some((s) => lower.includes(s.toLowerCase()))) {
      problems.push(`missing one of: ${group.join(' / ')}`);
    }
  }
  if (test.cite && answer.cited === 0) problems.push('no source cited');
  if (test.unknown && !/\b(don't|do not) know\b/i.test(text)) {
    problems.push(`should say "I don't know"`);
  }
  for (const pattern of test.forbid ?? []) {
    if (new RegExp(pattern, 'im').test(text)) problems.push(`matches /${pattern}/`);
  }
  return problems;
}

/**
 * Claude Haiku 5.5, US dollars per million tokens for prompts up to 100K tokens (claude-api
 * reference, cached 2026-10-06): input $0.10, output $0.50; cache writes 1.25x input, reads 0.1x.
 */
export const PRICES = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 } as const;

export function cost(usage: Usage): number {
  return (
    (usage.input_tokens * PRICES.input +
      (usage.cache_creation_input_tokens ?? 0) * PRICES.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * PRICES.cacheRead +
      usage.output_tokens * PRICES.output) /
    1e6
  );
}

/**
 * Before a run: about four characters a token; the first question writes the cached prefix, the
 * rest read it; up to 300 tokens an answer.
 */
export function estimate(prefixChars: number, questions: number): number {
  const prefix = Math.ceil(prefixChars / 4);
  return cost({
    input_tokens: questions * 30,
    cache_creation_input_tokens: prefix,
    cache_read_input_tokens: prefix * Math.max(0, questions - 1),
    output_tokens: questions * 300,
  });
}
