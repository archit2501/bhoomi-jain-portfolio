import type { ImageMetadata } from 'astro';
import placeholders from '../assets/media/placeholders.json';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/media/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

/** Content refers to photos by their path under src/assets/media/, e.g. "projects/smartblog.png". */
export function mediaImage(src: string): ImageMetadata {
  const file = files[`/src/assets/media/${src}`];
  if (!file) throw new Error(`Image not found: src/assets/media/${src}`);
  return file.default;
}

export interface Placeholder {
  /** The photo's dominant colour, painted first. */
  color: string;
  /** A 16px-wide WebP of the photo, stretched (and so blurred) until the real image decodes. */
  preview: string;
}

/** Written by scripts/placeholders.mjs before every build. */
export function mediaPlaceholder(src: string): Placeholder | undefined {
  return (placeholders as Record<string, Placeholder>)[src];
}
