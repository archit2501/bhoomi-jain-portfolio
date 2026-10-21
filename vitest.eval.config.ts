import { defineConfig } from 'vitest/config';

// The paid "Ask my AI" eval (evals/ai.eval.ts), kept out of `npm test`: `npm run eval:ai`.
export default defineConfig({
  test: {
    include: ['evals/**/*.eval.ts'],
    fileParallelism: false,
  },
});
