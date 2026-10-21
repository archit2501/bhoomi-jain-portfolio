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
    case 'poll':
      return [sticker.question, ...sticker.options].join(' ');
    case 'question':
    case 'slider':
      return sticker.prompt;
  }
}

/** The interactive stickers (poll, question box, emoji slider), which the live API answers. */
export type LiveSticker = Extract<Sticker, { type: 'poll' | 'question' | 'slider' }>;

export const isLive = (sticker: Sticker): sticker is LiveSticker =>
  sticker.type === 'poll' || sticker.type === 'question' || sticker.type === 'slider';

/** Placement as inline CSS custom properties; the sticker's own styles do the rest. */
export function stickerStyle(sticker: Pick<Sticker, 'x' | 'y' | 'rotate'>): string {
  return `--x: ${sticker.x}%; --y: ${sticker.y}%; --rotate: ${sticker.rotate}deg`;
}
