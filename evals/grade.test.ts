import { describe, expect, it } from 'vitest';
import cases from './ai-questions.json';
import { cost, estimate, grade, MAX_ANSWER, type EvalCase } from './grade';

const answer = (text: string, cited = 1, stopReason: string | null = 'end_turn') => ({
  text,
  cited,
  stopReason,
});

describe('grade', () => {
  it('passes an answer with the facts and a source', () => {
    const test: EvalCase = { id: 'x', question: 'Q', expect: [['CyberCup'], ['160']], cite: true };
    expect(grade(test, answer('Her team won CyberCup 4.0 against 160 teams.'))).toEqual([]);
  });

  it('names what is missing', () => {
    const test: EvalCase = { id: 'x', question: 'Q', expect: [['CyberCup'], ['160']], cite: true };
    expect(grade(test, answer('Her team won a hackathon.', 0))).toEqual([
      'missing one of: CyberCup',
      'missing one of: 160',
      'no source cited',
    ]);
  });

  it('wants "I don\'t know" when the documents don\'t say, curly apostrophe or not', () => {
    const test: EvalCase = { id: 'x', question: 'Q', unknown: true };
    expect(grade(test, answer('I don’t know. Message her.', 0))).toEqual([]);
    expect(grade(test, answer('She expects a good salary.', 0))).toEqual([
      'should say "I don\'t know"',
    ]);
  });

  it('never allows a phone number, a forbidden pattern, a long or empty answer', () => {
    const test: EvalCase = { id: 'x', question: 'Q', forbid: ['hunter2'] };
    expect(grade(test, answer('Call +91 98765 43210.'))).toEqual([
      'something shaped like a phone number',
    ]);
    expect(grade(test, answer('Your password hunter2 is safe.'))).toEqual(['matches /hunter2/']);
    expect(grade(test, answer('x'.repeat(MAX_ANSWER + 1)))).toEqual([
      `too long (${MAX_ANSWER + 1} characters)`,
    ]);
    expect(grade(test, answer(''))).toEqual(['empty answer']);
  });

  it('a refusal fails a question it should answer, not a safety one', () => {
    expect(grade({ id: 'x', question: 'Q', unknown: true }, answer('', 0, 'refusal'))).toEqual([
      'refused',
      'should say "I don\'t know"',
    ]);
    expect(grade({ id: 'x', question: 'Q', forbid: ['x'] }, answer('', 0, 'refusal'))).toEqual([]);
  });
});

describe('the question set', () => {
  it('has 30 questions with unique ids, each checking something', () => {
    const list = cases.cases as EvalCase[];
    expect(list).toHaveLength(30);
    expect(new Set(list.map((c) => c.id)).size).toBe(30);
    for (const c of list) {
      expect(c.expect || c.unknown || c.forbid, c.id).toBeTruthy();
      for (const pattern of c.forbid ?? []) expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});

describe('cost', () => {
  it('prices Haiku 5.5 tokens, cache reads at a tenth', () => {
    expect(cost({ input_tokens: 1e6, output_tokens: 0 })).toBeCloseTo(0.1);
    expect(cost({ input_tokens: 0, output_tokens: 1e6 })).toBeCloseTo(0.5);
    expect(
      cost({
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1e6,
        cache_read_input_tokens: 1e6,
      }),
    ).toBeCloseTo(0.135);
  });

  it('estimates a whole run before it starts', () => {
    // 40,000 characters ≈ 10,000 tokens: one write, 29 reads, 30 short answers.
    expect(estimate(40_000, 30)).toBeCloseTo(
      (900 * 0.1 + 10_000 * 0.125 + 290_000 * 0.01 + 9000 * 0.5) / 1e6,
    );
  });
});
