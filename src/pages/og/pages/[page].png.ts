import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';
import wordmarkSvg from '../../../assets/wordmark.svg?raw';
import { loadSiteContent } from '../../../lib/content';
import { ogSvg, svgInner } from '../../../lib/og';

/** Share cards for the app's own pages. */
const PAGES = {
  feed: { headline: 'Home', detail: 'Projects, experience and wins, newest first' },
  explore: { headline: 'Explore', detail: 'Every project, role and certification' },
  direct: { headline: 'Messages', detail: 'Hire me, collaborate, or just say hi' },
  notifications: { headline: 'Notifications', detail: 'Her career, as an activity feed' },
  insights: { headline: 'Insights', detail: 'Every number, with where it comes from' },
} as const;

export const getStaticPaths: GetStaticPaths = () =>
  Object.keys(PAGES).map((page) => ({ params: { page } }));

export const GET: APIRoute = async ({ params }) => {
  const { profile } = await loadSiteContent();
  const { headline, detail } = PAGES[params.page as keyof typeof PAGES];
  const svg = ogSvg({
    headline,
    detail,
    footer: `${profile.displayName} · ${profile.category}`,
    tone: 1,
    wordmark: svgInner(wordmarkSvg),
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
