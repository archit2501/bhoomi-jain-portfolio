# Bhoomi Jain — portfolio

The portfolio of Bhoomi Jain, a full stack developer in Delhi, laid out like a social app she
already knows by heart. Not affiliated with Instagram or Meta.

- **Profile:** her photo in a story ring, real numbers from her résumé, highlights that open as stories, and a grid of posts (projects, roles, degrees, wins) that open as case studies with diagrams and code.
- **Reels:** short vertical videos of her projects and figures.
- **Home:** her work as a dev log, with a lens switch: Frontend, Backend, AI.
- **Explore and Search:** one mosaic of everything; search that forgives typos.
- **Messages:** write to her about hiring, collaborating or just hello. She's told by Telegram or email and replies from a signed link.
- **Live:** real likes, comments she approves, story polls, "Active now".
- **Insights:** her GitHub, this site's Lighthouse scores and real totals, each with its source and time.

Every number is traced to her résumé or to its live source. Nothing is made up, and her
phone number is never published.

## Develop

```bash
npm ci
npm run dev             # local dev server
npm test                # unit and Worker integration tests (Vitest)
npm run test:e2e        # browser tests on five devices (Playwright, port 4447)
npm run build
npm run budget          # ≤ 40 KB of script per page, gzipped
npm run lighthouse      # Lighthouse CI at the launch bar
npm run content:review  # regenerate Bhoomi's sign-off sheet after a content change
```

Content lives in `src/content/`: her profile, résumé, posts (Markdown), highlights, reels,
Messages topics and milestones. The browser tests read their expectations from it, so changing
content needs no test edits. `docs/content-review.md` is the sheet she signs off from.

## Run it

It's a Cloudflare Worker: static pages, plus `/api/*` on D1, KV, a Durable Object and rate
limiters. [docs/runbook.md](docs/runbook.md) has the details. In short:

- **Moderation:** comments wait for her. Each new one reaches her by Telegram or webhook with Approve and Reject links (signed, 7 days). Messages come with a Read and reply link (30 days). She never needs a dashboard or a password.
- **Off switches:** `likes`, `comments`, `dms`, `polls`, `presence`, `ai_chat` live in KV and take effect at once, with no deploy. The site says when something is off.

  ```bash
  npx wrangler kv key put --binding FLAGS --remote flags '{"comments":false}'
  npx wrangler kv key delete --binding FLAGS --remote flags    # everything back on
  ```

- **Rollback:** a bad deploy is undone in seconds; then revert the commit too.

  ```bash
  npx wrangler deployments list
  npx wrangler rollback <version-id> -m "why"
  ```

- **After a deploy:** `BASE=https://<her domain> npm run smoke:prod` checks the pages, files, API, database and switches. CI runs it on every production deploy.

Before launch, work through [docs/launch-checklist.md](docs/launch-checklist.md).

Forked from an earlier Instagram-style portfolio (commit `52aef94`), without its history.
Planning lives in `research/` and `plan/` (kept out of git).
