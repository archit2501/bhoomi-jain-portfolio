import type { APIRoute, GetStaticPaths } from 'astro';
import { loadSiteContent } from '../../../lib/content';
import { cardResponse, glyphSvg, photoUri, renderCard, shortText } from '../../../lib/og-card';
import { site } from '../../../lib/site';

/** A share card per reel: its title and what it shows, on ink (task 6.3.5). */
export const getStaticPaths = (async () => {
  const { reels } = await loadSiteContent();
  return reels.map((reel) => ({ params: { id: reel.id }, props: { reel } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { reel } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const { profile } = await loadSiteContent();
  const play = glyphSvg('play');
  const png = await renderCard({
    field: 'ink',
    head: ['Reel', site.name],
    big: reel.data.title,
    label: reel.data.description ? shortText(reel.data.description, 80) : undefined,
    art: play ? { kind: 'glyph', svg: play } : undefined,
    avatar: profile.avatar.src ? await photoUri(profile.avatar.src, 112, 112) : undefined,
    footer: site.role,
  });
  return cardResponse(png);
};
