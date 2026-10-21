/** Share-card (Open Graph) images, drawn as SVG and rasterised to 1200×630 PNG at build time. */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const TONES = {
  1: ['#0b5e7a', '#0c1014'],
  2: ['#2b3036', '#0c1014'],
  3: ['#0b7a75', '#0b7a75'],
} as const;

export function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string,
  );
}

/** Greedy word wrap to at most `maxLines` lines; the last line ends with "…" if text was cut. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:]+$/, '')}…`;
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface OgCard {
  headline: string;
  detail?: string;
  footer: string;
  tone: 1 | 2 | 3;
  /** Inner markup of her wordmark SVG (paths drawn in currentColor). */
  wordmark: string;
}

export function ogSvg({ headline, detail, footer, tone, wordmark }: OgCard): string {
  const [from, to] = TONES[tone];
  const font = "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";
  // About 21 characters fit across the card at the two-line size.
  const headlineLines = wrapText(headline, 21, 2);
  const detailLines = detail ? wrapText(detail, 42, 2) : [];
  const headlineSize = headlineLines.length > 1 ? 88 : 104;
  let y = 250;
  const text: string[] = [];
  for (const line of headlineLines) {
    text.push(
      `<text x="80" y="${y}" font-family="${font}" font-size="${headlineSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`,
    );
    y += headlineSize * 1.08;
  }
  y += 24;
  for (const line of detailLines) {
    text.push(
      `<text x="80" y="${y}" font-family="${font}" font-size="40" fill="#ffffff">${escapeXml(line)}</text>`,
    );
    y += 52;
  }
  const mark = wordmark.replaceAll('currentColor', '#ffffff');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <svg x="80" y="64" width="135" height="42" viewBox="0 0 90 28">${mark}</svg>
  ${text.join('\n  ')}
  <text x="80" y="566" font-family="${font}" font-size="30" fill="#ffffff">${escapeXml(footer)}</text>
</svg>`;
}

/** The paths inside an SVG file, without its outer <svg> element. */
export function svgInner(svg: string): string {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
