# Her reels

Every reel on the site comes from this one HyperFrames composition (`index.html`): 1080×1920,
18 s, 30 fps, silent (the site plays reels muted, and each has a text description in
`src/content/reels.json`). The look is paper and ink, like her posts: flat fields from her palette,
Plus Jakarta Sans and Geist Mono (in `assets/fonts/`), her ring colours as lines and arcs.

## A reel is a scene list

`variables/<reel>.json` holds one variable, `scenes`: a JSON list of scenes that play in order. The
durations add up to 17.5 s, and the last half second wipes back to the first frame so the loop
is seamless. Each scene has a `type`, a `field` (paper, ink, deep, ocean, lime, emerald, cyan or
sky) and a `duration`:

| type | shows | fields it reads |
| --- | --- | --- |
| `hook` | the payoff number, already arriving on frame 0, over her ring arc | `kicker`, `hero`, `label`, optional `marks` `{total, struck}` or `change` `{percent, direction}` |
| `dots` | one dot per thing, one lit (her place), with a counter | `total`, `lit`, `label`, `unit` |
| `ring` | a ring of segments filling one by one (36 hours) | `segments`, `label`, optional `kicker` |
| `quote` | her own sentence, word by word | `kicker`, `chunks` |
| `arch` | the project's architecture, layer by layer, packets travelling | `title`, `nodes` `[{label, detail}]`, `edges` |
| `chips` | the stack | `kicker`, `chips` |
| `lines` | lines from her résumé, each with a ring tick | `kicker`, `lines` |
| `flow` | an explainer: `batch`, `lazy`, `compress` or `cache` | `kicker`, `title`, `mode`, and for batch/cache `from`, `to`, `cache`, `requests`, `hits` |
| `end` | her photo in her ring, name, role, handle | none |

**Every word comes from her content.** `tests/reel-scenes.test.ts` finds each string in her posts,
figures, résumé or profile; only labels like "Stack" or "2 / 3" are allowed besides. Pictograms
draw only stated numbers (160 dots, 36 segments, 20 marks with 9 struck for about 45%).

## Render and publish

From this folder:

```bash
npx --yes hyperframes@0.8.185 check
npx --yes hyperframes@0.8.185 render --quality looks --strict-variables \
  --variables-file variables/cybercup.json --output renders/cybercup.mp4
```

Then from the repository root, encode for the web (fast start, no audio track, about 1.3 MB) and
make its poster (the hook frame at 0.8 s, 720×1280 WebP):

```bash
ffmpeg -i media/reels/paper-reel/renders/cybercup.mp4 -c:v libx264 -preset slow -crf 25 \
  -pix_fmt yuv420p -profile:v high -tune animation -movflags +faststart -an public/reels/cybercup.mp4
node scripts/reel-posters.mjs
```

`tests/e2e/reels.spec.ts` checks every reel is an MP4 under 4 MB with fast start, and that its
poster exists. Renders are git-ignored; the copies in `public/reels/` are what ship.

`npx hyperframes check` warns that the film is silent (on purpose) and that the end card's lines
leave at 17.5 s: that's the loop frame returning to the opening, also on purpose.

## When her screenshots or recordings arrive

Add a scene type for them (a phone frame with the screen or clip in it) and put it between `arch`
and `chips` in that project's scene list. Use her real media only, never a mock-up.
