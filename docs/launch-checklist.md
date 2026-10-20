# Launch checklist

Everything automatable is checked on every pull request (see "What CI already checks" at the bottom). These steps need people.

## 1. Bhoomi's sign-off (blocks deploy)

Send `docs/asset-request.md` (task 1.1.5) if you haven't yet. When she replies:

- [ ] Every figure in `src/content/figures.json` comes from her 2026 résumé. If she corrects one, change it there and in every caption that shows it; the content checks fail the build if a listed figure isn't shown.
- [ ] Update wording she corrects in `src/content/` (bio, captions, story frames).
- [ ] Add the résumé as `links.resume` (the PDF in `public/`, without her phone number) in `src/content/profile.json`.
- [ ] Add photos and screenshots under `src/assets/media/` and reference them from posts (`type: "image"`, with alt text) or highlights.
- [ ] Run `REQUIRE_VERIFIED=1 npm run build` locally. It passes only when every figure is confirmed.

## 2. Real-device check (about 10 minutes)

Automated tests run Safari's engine (WebKit) on iPhone and iPad sizes and Chrome on Android, but not on real hardware. On a real iPhone (Safari) and a real Android phone (Chrome):

- [ ] Stories: tap the right side to go forward and the left third to go back; hold to pause and release to resume; swipe left and right between highlights; swipe down to close.
- [ ] iPhone only: swiping in from the very left edge goes back in Safari and doesn't change the story.
- [ ] Avatar ring opens the intro story and turns grey afterwards.
- [ ] Posts: tap a tile to open the post page; double-tap the media to like it; swipe the carousel posts.
- [ ] Reels: each plays muted and inline (not full-screen) and loops; the pause button works.
- [ ] Contact sheet slides up from the bottom and the LinkedIn link opens.
- [ ] Rotate to landscape once: nothing breaks.

## 3. Domain and deploy

- [ ] Choose her domain (no "insta" or "gram" in it; the brand-guard test enforces this).
- [ ] Add `public/CNAME` containing just the domain.
- [ ] At the DNS host, point the domain at GitHub Pages: an `ALIAS`/`ANAME` or four `A` records for the apex, or a `CNAME` to `archit2501.github.io` for a subdomain.
- [ ] In the repository settings, under Pages, set Source to "GitHub Actions" and enter the custom domain, then tick "Enforce HTTPS" once the certificate is issued.
- [ ] Set the repository variable `DEPLOY_ENABLED` to `true` (Settings, Secrets and variables, Actions, Variables). Until then the deploy job is skipped and the site stays unpublished.
- [ ] Merge to `main`. The deploy workflow builds with `REQUIRE_VERIFIED=1`, publishes, and smoke-tests the live site.

## What CI already checks

On every pull request and push to `main`:

- **Code:** ESLint, Prettier and `astro check`, all with zero errors and zero warnings.
- **Unit tests:** content schemas and guards, the story state machine and gestures, post navigation, share-card layout, SEO helpers, contrast and brand guard. The logic in `src/lib` has 100% statement coverage.
- **Playwright** on iPhone 15 (WebKit, dark), Pixel 8, iPad (WebKit), 1280px (dark) and 1440px. It includes axe WCAG 2.1 AA scans with zero serious or critical issues allowed.
- **Lighthouse** on the profile, Reels, a post, a story page and the 404: LCP 2.5 s or less, CLS 0.1 or less, and performance, best practices and SEO at 90 or above, accessibility at 100. They currently all score 100.
- **Brand guard** on the source and the built site: no Instagram colours, logo-like fonts, or "Instagram" in titles or meta tags.
