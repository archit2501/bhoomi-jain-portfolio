// Posters for the reels (task 6.3.4): each reel's hook frame, once its payoff has landed (the
// number, and its marks or bar finished), as a 720×1280 WebP, plus a 270×480 copy for the grid's
// small tiles (src/lib/reels.ts, posterSources). The reels open on their number, so the poster
// says what the reel is about before it plays. Needs ffmpeg; run after re-rendering a reel:
// `node scripts/reel-posters.mjs`.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = 'public/reels';
const SCENES = 'media/reels/paper-reel/variables';

/** When a reel's hook has settled (media/reels/paper-reel/index.html times it). */
function posterTime(id) {
  const file = `${SCENES}/${id}.json`;
  if (!existsSync(file)) return 0.8;
  const [hook] = JSON.parse(JSON.parse(readFileSync(file, 'utf8')).scenes);
  const settled = hook.marks ? 2.3 : hook.change ? 1.7 : 1.0;
  return Math.min(settled, hook.duration - 0.15);
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.mp4'))) {
  const id = file.replace(/\.mp4$/, '');
  const frame = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(posterTime(id)),
      '-i',
      join(DIR, file),
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-c:v',
      'png',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (frame.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${frame.stderr}`);
  // The full poster for the reel player and Explore, and a half-size copy for the grid's tiles.
  for (const [suffix, width, quality] of [
    ['', 720, 80],
    ['-sm', 270, 75],
  ]) {
    const out = join(DIR, `${id}${suffix}.webp`);
    const { size } = await sharp(frame.stdout)
      .resize(width, (width * 16) / 9)
      .webp({ quality })
      .toFile(out);
    console.log(`${out}: ${(size / 1024).toFixed(1)} KB`);
  }
}
