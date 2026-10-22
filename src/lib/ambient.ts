/**
 * The ambient glow behind desktop stories and reels (task 5.1.2): each item's two dominant
 * colours, worked out at build time from its image (or its tile's colours), so the browser only
 * paints a blurred wash of them. O(p) for p sampled pixels.
 */

export type Ambient = [string, string];

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

const saturation = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/**
 * The two colours that most define an image: pixels are grouped into 4,096 buckets (4 bits a
 * channel), each bucket scored by how many pixels it has, favouring colour over grey, and the
 * second pick must look clearly different from the first.
 */
export function dominantColors(pixels: Uint8Array, channels: 3 | 4): Ambient {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .map(({ n, r, g, b }) => {
      const [mr, mg, mb] = [r / n, g / n, b / n];
      return { rgb: [mr, mg, mb] as const, score: n * (0.35 + saturation(mr, mg, mb)) };
    })
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return ['#0c1014', '#0c1014'];
  const first = ranked[0].rgb;
  const far = ranked.find(
    ({ rgb }) => Math.hypot(rgb[0] - first[0], rgb[1] - first[1], rgb[2] - first[2]) > 64,
  );
  const second = far?.rgb ?? first.map((c) => c * 0.5);
  return [hex(...first), hex(second[0], second[1], second[2])];
}

/** A text tile's own colours (tokens.css), for frames and reels without an image. */
export const TONE_AMBIENT: Record<1 | 2 | 3, Ambient> = {
  1: ['#075985', '#0c1014'],
  2: ['#2b3036', '#0c1014'],
  3: ['#0369a1', '#075985'],
};

/** The CSS custom properties an element carries for the glow. */
export const ambientStyle = ([a, b]: Ambient) => `--ambient-a: ${a}; --ambient-b: ${b}`;
