import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/media/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

/** Content refers to photos by their path under src/assets/media/, e.g. "vastra-kala/dispatch.jpg". */
export function mediaImage(src: string): ImageMetadata {
  const file = files[`/src/assets/media/${src}`];
  if (!file) throw new Error(`Image not found: src/assets/media/${src}`);
  return file.default;
}
