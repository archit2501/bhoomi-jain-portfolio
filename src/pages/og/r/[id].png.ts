import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import wordmarkSvg from '../../../assets/wordmark.svg?raw';
import { loadSiteContent } from '../../../lib/content';
import { ogSvg, svgInner } from '../../../lib/og';
import { pageTitle } from '../../../lib/site';

/** A share card per reel: its title and the start of what it shows (task 5.1.1). */
export const getStaticPaths = (async () => {
  const { reels } = await loadSiteContent();
  return reels.map((reel, i) => ({ params: { id: reel.id }, props: { reel, i } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { reel, i } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const svg = ogSvg({
    headline: reel.data.title,
    detail: reel.data.description ?? 'Reel',
    footer: `Reel · ${pageTitle()}`,
    tone: ((i % 3) + 1) as 1 | 2 | 3,
    wordmark: svgInner(wordmarkSvg),
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
