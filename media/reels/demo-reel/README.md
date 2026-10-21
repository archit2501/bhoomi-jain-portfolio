# Project intro reels

One 20-second, 1080×1920 reel per project: a title card, her screen (or the project's
architecture diagram), the stack, the headline result and a sign-off. Every word comes from the
project's post in `src/content/posts/` and her résumé, through `variables/<project>.json`.

## When her screenshots or recordings arrive

1. Put the file in `assets/` (a recording as an H.264 MP4, a screenshot as PNG, JPEG or WebP,
   portrait, at least 760×1352).
2. In the project's `variables/<project>.json`, set `"clip": "assets/<file>.mp4"` for a recording
   or `"screen": "assets/<file>.png"` for a screenshot. A recording wins over a screenshot; with
   neither, the diagram shows.
3. Render and publish it, as below.

## Render and publish

```bash
npx --yes hyperframes@0.8.184 check
npx --yes hyperframes@0.8.184 render --quality looks --strict-variables \
  --variables-file variables/smartblog-ai.json --output renders/smartblog-ai.mp4
```

Then, from the repository root: copy the video into `public/reels/` with fast start and no audio
track, and make a 540×960 WebP poster from the first second:

```bash
ffmpeg -i media/reels/demo-reel/renders/smartblog-ai.mp4 -c copy -an -movflags +faststart public/reels/smartblog-ai.mp4
```

`tests/e2e/reels.spec.ts` checks every reel video is an MP4 under 4 MB with fast start, and that its
poster exists. Renders are git-ignored; the copies in `public/reels/` are what ship.
