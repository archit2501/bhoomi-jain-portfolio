import type { APIRoute } from 'astro';
import { loadSiteContent } from '../lib/content';
import { sitemapXml } from '../lib/seo';

export const GET: APIRoute = async ({ site }) => {
  const { posts, highlights, reels, dmThreads } = await loadSiteContent();
  const paths = [
    '/',
    '/reels/',
    '/tagged/',
    '/feed/',
    '/explore/',
    '/direct/',
    '/notifications/',
    '/insights/',
    ...posts.map((p) => `/p/${p.id}/`),
    ...highlights.map((h) => `/stories/${h.id}/`),
    ...reels.map((r) => `/reels/${r.id}/`),
    ...dmThreads.map((t) => `/direct/${t.id}/`),
  ];
  return new Response(sitemapXml(paths.map((path) => new URL(path, site).href)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
