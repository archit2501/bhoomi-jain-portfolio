import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import wordmarkSvg from '../../../assets/wordmark.svg?raw';
import { loadSiteContent } from '../../../lib/content';
import { ogSvg, svgInner } from '../../../lib/og';
import { pageTitle } from '../../../lib/site';

/** A share card per highlight: its name and what its first story says (task 5.1.1). */
export const getStaticPaths = (async () => {
  const { highlights } = await loadSiteContent();
  return highlights.map((highlight) => ({ params: { id: highlight.id }, props: { highlight } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { highlight } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const first = highlight.data.frames.find((f) => f.type === 'text');
  const count = highlight.data.frames.length;
  const svg = ogSvg({
    headline: highlight.data.label,
    detail: first ? (first.heading ?? first.body) : `${count} ${count === 1 ? 'story' : 'stories'}`,
    footer: `Highlights · ${pageTitle()}`,
    tone: 2,
    wordmark: svgInner(wordmarkSvg),
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
