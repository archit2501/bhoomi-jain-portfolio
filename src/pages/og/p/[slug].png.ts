import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import wordmarkSvg from '../../../assets/wordmark.svg?raw';
import { loadSiteContent } from '../../../lib/content';
import { ogSvg, svgInner } from '../../../lib/og';
import { pageTitle, tileTone } from '../../../lib/site';

export const getStaticPaths = (async () => {
  const { posts } = await loadSiteContent();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const first = post.data.media.find((m) => m.type === 'text');
  const svg = ogSvg({
    headline: first?.headline ?? post.data.title,
    detail: first?.detail ?? post.data.org,
    footer: pageTitle(),
    tone: tileTone(post.data.order),
    wordmark: svgInner(wordmarkSvg),
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
