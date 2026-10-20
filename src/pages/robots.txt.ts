import type { APIRoute } from 'astro';
import { robotsTxt } from '../lib/seo';

export const GET: APIRoute = ({ site }) =>
  new Response(robotsTxt(new URL('/sitemap.xml', site).href), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
