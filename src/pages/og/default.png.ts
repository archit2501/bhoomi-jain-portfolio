import type { APIRoute } from 'astro';
import sharp from 'sharp';
import wordmarkSvg from '../../assets/wordmark.svg?raw';
import { loadSiteContent } from '../../lib/content';
import { ogSvg, svgInner } from '../../lib/og';
import { pageTitle } from '../../lib/site';

/** The share card for pages without their own: the profile, Reels, stories and 404. */
export const GET: APIRoute = async () => {
  const { profile } = await loadSiteContent();
  const svg = ogSvg({
    headline: profile.displayName,
    detail: `${profile.category} · ${profile.location}`,
    footer: pageTitle(),
    tone: 1,
    wordmark: svgInner(wordmarkSvg),
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
