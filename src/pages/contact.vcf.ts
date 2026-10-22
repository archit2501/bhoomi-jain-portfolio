import type { APIRoute } from 'astro';
import { loadSiteContent } from '../lib/content';
import { vcard } from '../lib/vcard';

/** Her contact card, from the share sheet (task 5.1.1). Built with the site. */
export const GET: APIRoute = async ({ site }) => {
  const { profile, resume } = await loadSiteContent();
  return new Response(vcard(profile, resume, new URL('/', site).href), {
    headers: { 'Content-Type': 'text/vcard; charset=utf-8' },
  });
};
