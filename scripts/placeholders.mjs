// Writes src/assets/media/placeholders.json: for every photo under src/assets/media/, its dominant
// colour and a 16px-wide WebP preview (a few hundred bytes), shown while the real image loads.
// Runs before every build (`prebuild`), so a new photo can't ship without one.
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../src/assets/media/', import.meta.url));
const OUT = join(ROOT, 'placeholders.json');
const PHOTO = /\.(jpe?g|png|webp|avif)$/i;

async function photos(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? photos(join(dir, e.name)) : PHOTO.test(e.name) ? [join(dir, e.name)] : [],
    ),
  );
  return nested.flat().sort();
}

const hex = (n) => n.toString(16).padStart(2, '0');
const out = {};
for (const path of await photos(ROOT)) {
  const image = sharp(path).rotate();
  const { dominant } = await image.clone().stats();
  const preview = await image.clone().resize(16).webp({ quality: 40 }).toBuffer();
  out[relative(ROOT, path).split('\\').join('/')] = {
    color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
    preview: `data:image/webp;base64,${preview.toString('base64')}`,
  };
}
await writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`placeholders: ${Object.keys(out).length} photo(s) -> ${relative(process.cwd(), OUT)}`);
