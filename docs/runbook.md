# Runbook

How the site runs in production and what to do when something goes wrong. Commands run from the repository root, logged in with `npx wrangler login` or with `CLOUDFLARE_API_TOKEN` set.

## How it's hosted

One Cloudflare Worker (`bhoomi-jain-portfolio`, configured in `wrangler.jsonc`):

- Every page is prerendered and served as a static asset (free and unlimited on Workers).
- Only `/api/*` routes run code at request time. `src/pages/api/health.ts` reports liveness, the off switches and whether the database answers (503 if it doesn't).
- Bindings:
  - `FLAGS` (KV): the off switches.
  - `COUNTERS` (KV): daily write counters, a site-wide ceiling per kind of write.
  - `DB` (D1): likes, comments, DMs, poll votes and question answers. The schema is in `migrations/`.
  - `WRITE_LIMIT_IP` and `WRITE_LIMIT_VISITOR` (Rate Limiting): 30 writes a minute per IP, 12 per visitor.
  - `PRESENCE` (Durable Object, class `Presence` in `src/workers/presence.ts`): the live room. The Worker's entrypoint is `src/worker.ts`, Astro's handler plus that class.
  - Secret `TURNSTILE_SECRET`: without it, every write is refused.
  - Secret `APPROVAL_SECRET`: signs Bhoomi's approve and reject links for comments.
  - Secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, and/or `NOTIFY_WEBHOOK_URL`: where her notices go.

Every write goes through one pipeline (`src/lib/server/guard.ts`), in this order: the feature's off switch, same-origin JSON under 8 KB, Turnstile, both rate limits, then today's cap. Visitors are anonymous: a random id in an HttpOnly cookie. IP addresses are used only as rate-limit keys and never stored.

## Connect Cloudflare (once, by the account owner)

1. Create a free Cloudflare account, or use an existing one. Open **Workers & Pages** once: it shows the account's workers.dev subdomain, and asks for one if there isn't one yet. A deploy from CI can't choose it. The site's address is then `https://bhoomi-jain-portfolio.<subdomain>.workers.dev`. The brand guard refuses a `SITE_URL` containing "insta" or "gram", so pick a subdomain without them.
2. Create an API token from the **Edit Cloudflare Workers** template, and add one row to it: **Account, D1, Edit**. The template covers Workers, KV and Durable Objects but not D1, and the deploy creates and migrates the database. Copy the token, and copy the account ID from the dashboard sidebar.
3. In GitHub, go to the repository, then Settings, Secrets and variables, Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   - Variables: `SITE_URL` (the workers.dev address from step 1 until her domain is connected, then `https://<her domain>`), and `DEPLOY_ENABLED` = `true`.
   - Variable `ALLOW_TEXT_POSTS` = `true`, while her posts are still text tiles. A production build refuses more than one post without a photo or screen; this lets it through and lists them in the build log. Delete the variable once her screenshots and photos are in.

   Secrets in the steps below can also be set without a terminal, once the first deploy has created the Worker: dashboard, Workers & Pages, `bhoomi-jain-portfolio`, Settings, Variables and Secrets, Add, type **Secret**. Deploys keep them.

4. Create a Turnstile widget (dashboard, Turnstile, Add widget) for her domain and the workers.dev host, in **Managed** mode. Add its site key as the repository variable `TURNSTILE_SITE_KEY` (it's public). Then set its secret on both Workers. Previews keep Cloudflare's test keys: the always-pass test secret, `1x0000000000000000000000000000000AA`, accepts the test site key the preview build uses:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET -c wrangler.jsonc                  # the real secret key
   npx wrangler secret put TURNSTILE_SECRET -c wrangler.jsonc --env preview    # test secret is fine
   ```

5. Set up Bhoomi's notices (new comments now, DMs later). Approval links need a long random secret:

   ```bash
   openssl rand -base64 32 | npx wrangler secret put APPROVAL_SECRET -c wrangler.jsonc
   ```

   Then pick a channel, or both:
   - **Telegram:** she creates a bot with @BotFather, sends it any message, and reads her chat id from `https://api.telegram.org/bot<token>/getUpdates`. Then `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put TELEGRAM_CHAT_ID`.
   - **Webhook:** `wrangler secret put NOTIFY_WEBHOOK_URL` with any URL that takes a JSON POST (`{ title, lines, links }`), for example an automation that emails her.

6. Re-run the latest **Deploy** workflow on `main`, or merge anything. The first deploy creates the KV namespaces, the database and the rate limiters, then applies the migrations.

Until step 3 is done, the Deploy workflow's jobs are skipped and nothing is published. Until step 4 is done, the site works but refuses every like, comment and message. Until step 5 is done, comments are saved but nobody is told, so none get approved.

## Go live on her domain

Once the domain is on Cloudflare (it's added as a zone in the same account):

1. In `wrangler.jsonc`, add the domain as a custom domain of the Worker:

   ```jsonc
   "routes": [{ "pattern": "<her domain>", "custom_domain": true }],
   ```

2. Set the repository variable `SITE_URL` to `https://<her domain>`. Canonical links, share cards, the sitemap and the QR card all take it from there.
3. Add the domain to the Turnstile widget's hostnames.
4. Merge. The deploy migrates the database, deploys, and runs the smoke test (`npm run smoke:prod`). It fails, and says to roll back, if a page, a file, the API, the database or a switch isn't right.
5. Work through `docs/launch-checklist.md`: her sign-off, the AI eval, and the kill-switch and rollback drills on production.

## Previews

Each pull request uploads a version of a separate Worker, `bhoomi-jain-portfolio-preview` (the `preview` environment in `wrangler.jsonc`), under the alias `pr-<number>`. The workflow migrates the preview database, comments the preview URL on the pull request and smoke-tests it. Production keeps serving the current deployment.

The preview Worker has its own database, KV namespaces and rate limiters, so a preview can never read or write production data. (Wrangler's `previews` block would do the same, but it only applies to `wrangler preview`, which is still in open beta.)

## Off switches

Live features can be turned off without a redeploy. A switch is on unless the stored JSON turns it off, and bad JSON is ignored (everything stays on).

| Switch     | Feature                            |
| ---------- | ---------------------------------- |
| `likes`    | Liking posts and reels             |
| `comments` | Posting comments                   |
| `dms`      | Sending DMs                        |
| `polls`    | Story polls, questions and sliders |
| `presence` | "Active now" and live poll results |
| `ai_chat`  | "Ask Bhoomi's AI" thread           |

A switched-off feature answers 503 before it touches anything.

```bash
# See the current switches (also shown at /api/health)
npx wrangler kv key get --binding FLAGS --remote flags

# Turn the AI chat off (write the whole object; omitted switches are on)
npx wrangler kv key put --binding FLAGS --remote flags '{"ai_chat":false}'

# Everything back on
npx wrangler kv key delete --binding FLAGS --remote flags
```

KV changes reach every location within about 60 seconds. Check with `curl <SITE_URL>/api/health`.

## Database

```bash
npx wrangler d1 migrations list DB --remote -c wrangler.jsonc     # what has been applied
npx wrangler d1 migrations apply DB --remote -c wrangler.jsonc    # apply new ones (the deploy does this)
npx wrangler d1 execute DB --remote -c wrangler.jsonc --command "SELECT COUNT(*) FROM likes"
npx wrangler d1 time-travel restore DB -c wrangler.jsonc --timestamp=<unix-time>   # undo a bad write
```

Add a migration as the next numbered file in `migrations/`. Keep it additive (new tables and columns), because the deploy migrates before the new code goes live. Always pass `-c wrangler.jsonc`: after a build, wrangler otherwise follows the Astro adapter's redirect to `dist/server`.

Daily caps per kind of write are in `DAILY_CAPS` (`src/lib/server/guard.ts`); rate limits are in `wrangler.jsonc`.

## Comments

Every comment is saved as pending and never shown until Bhoomi approves it. Her notice has **Approve** and **Reject** links, signed with `APPROVAL_SECRET` and valid for 7 days. A link opens a page with the comment and one button; only pressing it decides, so a link checker or preview bot following the link changes nothing. A decision is final.

To approve one by hand, for example after its link expired:

```bash
npx wrangler d1 execute DB --remote -c wrangler.jsonc --command "SELECT id, post, name, body FROM comments WHERE status = 'pending'"
npx wrangler d1 execute DB --remote -c wrangler.jsonc --command "UPDATE comments SET status = 'approved', decided_at = unixepoch() * 1000 WHERE id = '<id>'"
```

Rotating `APPROVAL_SECRET` invalidates every link that has been sent.

## Messages

A visitor picks a topic (`/direct/<topic>/`; the topics and her opening lines are in `src/content/dm-threads.json`), writes, and lands on their private conversation: `/direct/thread/#<id>.<secret>`. The key stays in the link's fragment, so it never reaches a server log. Only a hash of the secret is stored. This browser lists the visitor's own conversations; anyone with the link can read that conversation, and the page says so.

Bhoomi gets each new message, the first and every one after, through the same channels as comments, with a **Read and reply** link. It's signed with `APPROVAL_SECRET` and valid for 30 days. The link opens the conversation (with their email, if they gave one) and a reply box. Her reply appears on the visitor's private link within 20 seconds while they have it open.

The `dms` switch stops new messages. Reading a conversation and replying keep working.

## GitHub sync

Every hour, at seven past, a Cron Trigger runs `src/workers/github-sync.ts`. It reads from GitHub:

- her contribution calendar for the past year;
- her commits this year;
- her own public repositories;
- her latest public events.

It stores all of that as one snapshot in the `SNAPSHOTS` KV namespace, with the time it was taken. Insights shows GitHub's numbers "as of" that time. If GitHub fails, the last good snapshot stays and the failure is recorded beside it. With no snapshot, the page says her GitHub activity is unavailable, and never shows a placeholder number.

To turn it on:

1. Add her GitHub link to `src/content/profile.json` (`links.github`, for example `https://github.com/<username>`). The username comes from there.
2. Create a fine-grained personal access token (GitHub, Settings, Developer settings). Under repository access, choose **Public repositories (read-only)**, and add no other permissions. It can then only read what's already public. Set it on production:

   ```bash
   npx wrangler secret put GITHUB_TOKEN -c wrangler.jsonc
   ```

3. Deploy. The first snapshot arrives at the next seven-past-the-hour. To try the sync locally, build, run `npx wrangler dev -c dist/server/wrangler.json --test-scheduled`, then open `http://localhost:8787/cdn-cgi/handler/scheduled?cron=7+*+*+*+*`.

To see what's stored:

```bash
npx wrangler kv key get --binding SNAPSHOTS --remote github:status     # the last sync: when, ok or why not
npx wrangler kv key get --binding SNAPSHOTS --remote github:snapshot   # what screens show
```

`GET /api/github` serves the snapshot, cached for five minutes. A snapshot of a different username is never shown, which matters if the profile link changes.

## The live room

Every page opens one WebSocket to `/api/live`, which goes to a single `Presence` Durable Object. It uses WebSocket hibernation, so it sleeps between messages and costs nothing while idle. Its socket count lights "Active now · N here" on her avatar. After each poll vote, the vote endpoint posts the new results to it, and it relays them to every open page.

With `presence` off, or if WebSockets fail, pages stay static: no "Active now", and a poll shows results only after your own vote. With `polls` off, the stickers say answers are off. Question-box answers go to her notices only and are never served.

## Roll back a bad deploy

```bash
npx wrangler deployments list            # find the last good version ID
npx wrangler rollback <version-id> -m "why"
```

Rollback switches production to an earlier version immediately. It doesn't change `main`, so revert the bad commit too, or the next merge redeploys it. Rolling back doesn't undo KV or database writes.

## Local development

```bash
npm run dev        # Astro dev server, running in workerd
npm run build && npm run preview -- --port 4447 --ignore-lock   # the production build in workerd
npx wrangler kv key put --binding FLAGS --local flags '{"dms":false}'   # local switches
npx wrangler d1 migrations apply DB --local -c wrangler.jsonc         # local database
cp .dev.vars.example .dev.vars                                        # local Turnstile test secret
```

Local KV and D1 live in `.wrangler/state` (git-ignored). The Worker integration tests (`src/lib/server/*.test.ts`) start their own in-memory copies of every binding from `wrangler.jsonc`.
