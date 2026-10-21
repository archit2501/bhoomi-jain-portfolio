import type { APIRoute } from 'astro';
import { loadSiteContent } from '../lib/content';
import { sitemapXml } from '../lib/seo';

export const GET: APIRoute = async ({ site }) => {
  const { posts, highlights } = await loadSiteContent();
  const paths = [
    '/',
    '/reels/',
    '/feed/',
    '/explore/',
    '/direct/',
    '/notifications/',
    '/insights/',
    ...posts.map((p) => `/p/${p.id}/`),
    ...highlights.map((h) => `/stories/${h.id}/`),
  ];
  return new Response(sitemapXml(paths.map((path) => new URL(path, site).href)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
