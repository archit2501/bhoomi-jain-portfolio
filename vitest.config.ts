import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: ['src/**/*.container.test.ts'],
        },
      },
      './vitest.components.config.ts',
    ],
    coverage: {
      provider: 'v8',
      // The 80% gate covers the logic in src/lib. Browser wiring in src/scripts (pop-up, carousel,
      // like, story viewer) only connects that logic to the DOM; Playwright drives it in a real
      // browser (tests/e2e). content.ts and media.ts only hand Astro's loaders to the tested code.
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/lib/content.ts', 'src/lib/media.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
