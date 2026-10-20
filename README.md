# Bhoomi Jain — portfolio

Portfolio for Bhoomi Jain, a full stack developer in Delhi. The site is laid out like a social profile: highlights that open as stories, a post grid of projects and experience, and short reels.

Forked from an earlier Instagram-style portfolio (commit `52aef94`), without its history. Planning lives in `research/` and `plan/` (kept out of git).

## Develop

```bash
npm ci
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests on five devices (Playwright, port 4447)
npm run build
```

The browser tests read their expectations from `src/content/`, so changing content needs no test edits.

Not affiliated with Instagram or Meta.
