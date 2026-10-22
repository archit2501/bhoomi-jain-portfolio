import type { APIRoute } from 'astro';
import { loadSiteContent } from '../lib/content';

/** The web app manifest (task 5.1.3): her site installs like an app, standalone. */
export const GET: APIRoute = async () => {
  const { profile } = await loadSiteContent();
  const manifest = {
    id: '/',
    name: profile.displayName,
    short_name: profile.displayName.split(/\s+/)[0],
    description: `${profile.displayName}, ${profile.category}: her work, her stories and a way to reach her.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Reels', url: '/reels/' },
      { name: 'Messages', url: '/direct/' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
};
