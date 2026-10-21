// Draws the app icons from her "b" mark: `node scripts/icons.mjs`. Re-run after changing the mark
// or the accent; the PNGs are committed.
import sharp from 'sharp';

const ACCENT = '#0369a1';
const GLYPH = `<g fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3v21"/><circle cx="8" cy="18" r="6"/></g>`;

/** The mark centred on the accent; `safe` is the share of the canvas the glyph may use. */
function icon(size, { radius = 0, safe = 0.62 } = {}) {
  const scale = (size * safe) / 28;
  const x = (size - 16 * scale) / 2;
  const y = (size - 28 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${ACCENT}"/>
  <g transform="translate(${x} ${y}) scale(${scale})">${GLYPH}</g>
</svg>`;
}

const out = [
  ['public/icons/icon-192.png', icon(192, { radius: 42 })],
  ['public/icons/icon-512.png', icon(512, { radius: 112 })],
  // Maskable: full-bleed background, glyph inside the 80% safe zone the OS may crop to a circle.
  ['public/icons/icon-maskable-512.png', icon(512, { safe: 0.46 })],
  ['public/icons/apple-touch-icon.png', icon(180, { safe: 0.58 })],
];
for (const [path, svg] of out) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path);
  console.log('wrote', path);
}
