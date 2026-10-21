import type { Sticker } from '../content-schema';

/** "www.linkedin.com" → "linkedin.com": what Instagram prints on a link sticker. */
export function linkDomain(href: string): string {
  return new URL(href).hostname.replace(/^www\./, '');
}

/** The words a sticker shows, as a screen reader and the content checks read them. */
export function stickerText(sticker: Sticker): string {
  switch (sticker.type) {
    case 'link':
      return sticker.label ?? linkDomain(sticker.href);
    case 'mention':
      return `@${sticker.name}`;
    case 'location':
      return sticker.name;
    case 'code':
      return sticker.code;
  }
}

/** Placement as inline CSS custom properties; the sticker's own styles do the rest. */
export function stickerStyle(sticker: Pick<Sticker, 'x' | 'y' | 'rotate'>): string {
  return `--x: ${sticker.x}%; --y: ${sticker.y}%; --rotate: ${sticker.rotate}deg`;
}
