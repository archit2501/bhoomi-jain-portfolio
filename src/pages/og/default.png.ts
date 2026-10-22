import type { APIRoute } from 'astro';
import { loadSiteContent } from '../../lib/content';
import { cardResponse, photoUri, renderCard } from '../../lib/og-card';

/** The share card for pages without their own: her, in her ring (task 6.3.5). */
export const GET: APIRoute = async () => {
  const { profile } = await loadSiteContent();
  const photo = profile.avatar.src ? await photoUri(profile.avatar.src, 300, 300) : undefined;
  const png = await renderCard({
    field: 'paper',
    head: [profile.category, profile.location],
    big: profile.displayName,
    label: profile.category,
    detail: profile.bio.split('\n')[0],
    art: photo ? { kind: 'portrait', src: photo } : undefined,
    footer: profile.bio.split('\n')[1] ?? profile.category,
  });
  return cardResponse(png);
};
