# Runbook

How the site runs in production and what to do when something goes wrong. Commands run from the repository root, logged in with `npx wrangler login` or with `CLOUDFLARE_API_TOKEN` set.

## How it's hosted

One Cloudflare Worker (`bhoomi-jain-portfolio`, configured in `wrangler.jsonc`):

- Every page is prerendered and served as a static asset (free and unlimited on Workers).
- Only `/api/*` routes run code at request time. `src/pages/api/health.ts` reports liveness and the off switches.
- Bindings: `FLAGS` (KV, off switches). Later tasks add D1, Durable Objects and secrets; each gets a section here.

## Connect Cloudflare (once, by the account owner)

1. Create a free Cloudflare account, or use an existing one.
2. Create an API token from the **Edit Cloudflare Workers** template. Copy it, and copy the account ID from the dashboard sidebar.
3. In GitHub, go to the repository, then Settings, Secrets and variables, Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   - Variables: `SITE_URL` (the workers.dev URL until her domain is connected, then `https://<her domain>`), and `DEPLOY_ENABLED` = `true`.
4. Re-run the latest **Deploy** workflow on `main`, or merge anything. The first deploy creates the `FLAGS` KV namespace automatically.

Until step 3 is done, the Deploy workflow's jobs are skipped and nothing is published.

## Previews

Each pull request uploads a new Worker **version** under the alias `pr-<number>` without deploying it. The workflow comments the preview URL on the pull request and smoke-tests it. Production keeps serving the current deployment.

Previews share production's bindings. That's harmless while `FLAGS` is the only binding, because previews only read it. **Before the database lands (task 3.1.1), add separate preview bindings under `previews` in `wrangler.jsonc`**, so a preview never writes to production data.

## Off switches

Live features can be turned off without a redeploy. A switch is on unless the stored JSON turns it off, and bad JSON is ignored (everything stays on).

| Switch     | Feature                            |
| ---------- | ---------------------------------- |
| `ai_chat`  | "Ask Bhoomi's AI" thread           |
| `comments` | Posting comments                   |
| `polls`    | Story polls, questions and sliders |
| `dms`      | Sending DMs                        |

```bash
# See the current switches (also shown at /api/health)
npx wrangler kv key get --binding FLAGS --remote flags

# Turn the AI chat off (write the whole object; omitted switches are on)
npx wrangler kv key put --binding FLAGS --remote flags '{"ai_chat":false}'

# Everything back on
npx wrangler kv key delete --binding FLAGS --remote flags
```

KV changes reach every location within about 60 seconds. Check with `curl <SITE_URL>/api/health`.

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
```

Local KV lives in `.wrangler/state` (git-ignored).
