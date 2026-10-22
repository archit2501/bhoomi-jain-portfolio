/**
 * Build time only: an image file's two dominant colours (src/lib/ambient.ts), sampled from a
 * 48-pixel thumbnail with sharp. Remembered per file for the length of the build.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { dominantColors, type Ambient } from './ambient';

const seen = new Map<string, Promise<Ambient | null>>();

/**
 * A path under public/ ("/reels/x.webp"), or under src/assets/media/ for content photos; null
 * when the file isn't there.
 */
export function ambientOf(
  path: string,
  root: 'public' | 'media' = 'public',
): Promise<Ambient | null> {
  const base = root === 'public' ? 'public' : join('src', 'assets', 'media');
  const file = join(process.cwd(), base, path);
  let result = seen.get(file);
  if (!result) {
    result = existsSync(file)
      ? sharp(file)
          .resize(48, 48, { fit: 'cover' })
          .removeAlpha()
          .raw()
          .toBuffer()
          .then((data) => dominantColors(new Uint8Array(data), 3))
          .catch(() => null)
      : Promise.resolve(null);
    seen.set(file, result);
  }
  return result;
}
