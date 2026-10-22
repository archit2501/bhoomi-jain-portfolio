# Launch checklist

Task 5.2.1. What's checked automatically on every change, what was checked by hand, and what
only the owner can do. Tick the owner's items as they're done.

## Checked on every change (CI)

| Check                                                                                       | Where                                                                                        | Bar                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Every route answers, no console errors, on 5 devices (iPhone, Pixel, iPad, laptop, desktop) | `tests/e2e/qa.spec.ts`                                                                       | every page in the sitemap, plus Saved, Offline and a private thread                               |
| axe on every page, light and dark                                                           | `tests/e2e/a11y.spec.ts`                                                                     | no serious or critical issue, WCAG 2.2 AA rules (target size included)                            |
| axe on every dialog and sheet                                                               | `qa.spec.ts`, `shell.spec.ts`, `share.spec.ts`, `shortcuts.spec.ts`, `notifications.spec.ts` | Search, Notifications, Create, More, links, share, shortcuts, post pop-up, story viewer, comments |
| Focus never hidden behind the top bar or tab bar (WCAG 2.4.11)                              | `qa.spec.ts`                                                                                 | 40 Tabs through the feed, a post and a conversation, on each device                               |
| A button for every gesture (WCAG 2.5.1, 2.5.7)                                              | `stories-v2.spec.ts`, `reels.spec.ts`                                                        | stories, highlights, pause, close, next and previous reel: all keyboard and button reachable      |
| Single-key shortcuts can be turned off (WCAG 2.1.4)                                         | `shortcuts.spec.ts`                                                                          | the switch on the "?" sheet, kept in the browser                                                  |
| Lighthouse, mobile (simulated mid-range phone), 10 pages                                    | `lighthouserc.json`                                                                          | accessibility 100, performance ≥ 95, best practices and SEO ≥ 90, LCP ≤ 2.0 s, CLS ≤ 0.1          |
| JavaScript per page                                                                         | `npm run budget`                                                                             | ≤ 40 KB gzipped; the heaviest page is about 20 KB                                                 |
| Kill-switch drill                                                                           | `src/lib/server/kill-switch.test.ts`                                                         | every switch off: every write refused as "disabled", nothing stored; back on: all work            |
| Brand guard                                                                                 | `tests/brand-guard.test.ts`                                                                  | no Instagram logo, wordmark or colours; the not-affiliated line on every page                     |
| Résumé guard                                                                                | `tests/resume-content.test.ts` and the content checks in the build                           | every figure traced to her résumé; no phone number anywhere                                       |
| Content sign-off sheet matches the site                                                     | `tests/content-review.test.ts`                                                               | `docs/content-review.md` regenerated whenever content changes                                     |

## Checked by hand (WCAG 2.2 pass, 22 Oct 2026)

- [x] Every gesture has a button: swipe between stories (arrows), swipe down to close (Close), hold to pause (Pause), double-tap to like (the heart).
- [x] Targets are at least 24 px or spaced as WCAG 2.5.8 allows: axe's target-size rule runs on every page and dialog. Fixed along the way: search's clear button, the feed's "more", "View comments" and post titles, and the profile's actions wrapping instead of overflowing.
- [x] Focus is never hidden: the page has scroll padding for the fixed bars, and the check above runs on all five devices.
- [x] Reduced motion: no zoom, cube, spring, odometer or glow transition when it's asked for.
- [x] Without JavaScript: profile, posts, stories pages, Explore, Notifications (milestones), Messages (email and LinkedIn instead of the form) all work.

## Only the owner can do

- [ ] **Bhoomi signs off on every caption and figure:** `docs/content-review.md`, one box per line. Lines marked _(new wording)_ were written for the site, not taken from her résumé.
- [ ] **The AI eval passes** (PR for task 3.2.3 waits on it): `AI_EVAL=1 ANTHROPIC_API_KEY=<key> npm run eval:ai`. It calls the paid API, about half a US cent a run.
- [ ] **Kill-switch drill on production**, once secrets are set (runbook, Off switches): switch everything off, check the site says so, switch it back on.

  ```bash
  npx wrangler kv key put --binding FLAGS --remote flags '{"likes":false,"comments":false,"dms":false,"polls":false,"presence":false,"ai_chat":false}'
  curl -s https://<her domain>/api/health    # every flag false
  npx wrangler kv key delete --binding FLAGS --remote flags   # all back on
  ```

- [ ] **Rollback drill on production**: deploy, roll back to the version before, check the smoke paths, roll forward again.

  ```bash
  npx wrangler deployments list
  npx wrangler rollback <previous-version-id> -m "rollback drill"
  npx wrangler rollback <latest-version-id> -m "rollback drill: forward again"
  ```

- [ ] **Secrets and settings** (runbook, Connect Cloudflare): Cloudflare token and account, Turnstile keys, `APPROVAL_SECRET`, Telegram or webhook, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` and her GitHub link.
