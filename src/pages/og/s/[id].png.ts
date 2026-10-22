import type { APIRoute, GetStaticPaths } from 'astro';
import { loadSiteContent } from '../../../lib/content';
import type { Field } from '../../../lib/fields';
import { cardResponse, glyphSvg, photoUri, renderCard, shortText } from '../../../lib/og-card';
import { site } from '../../../lib/site';

/** A share card per highlight: its name on its stop of her ring, and its glyph (task 6.3.5). */
export const getStaticPaths = (async () => {
  const { highlights } = await loadSiteContent();
  // Its stop on the ring is its place in the row, as on the profile (the intro isn't in it).
  const row = highlights.filter((h) => h.data.inRow);
  return highlights.map((highlight) => ({
    params: { id: highlight.id },
    props: { highlight, i: Math.max(0, row.indexOf(highlight)) },
  }));
}) satisfies GetStaticPaths;

const RING: readonly Field[] = ['lime', 'emerald', 'cyan', 'sky'];

export const GET: APIRoute = async ({ props }) => {
  const { highlight, i } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const { profile } = await loadSiteContent();
  const { cover, frames, label } = highlight.data;
  const first = frames.find((f) => f.type === 'text');
  const glyph = cover.type === 'icon' ? glyphSvg(cover.icon) : undefined;
  const count = `${frames.length} ${frames.length === 1 ? 'story' : 'stories'}`;
  const png = await renderCard({
    field: cover.type === 'icon' ? RING[i % RING.length] : 'paper',
    head: ['Highlight', count],
    big: label,
    label: first ? shortText(first.heading ?? first.body ?? '', 70) || undefined : undefined,
    art: glyph
      ? { kind: 'glyph', svg: glyph }
      : cover.type === 'image'
        ? { kind: 'portrait', src: await photoUri(cover.src, 300, 300) }
        : undefined,
    avatar: profile.avatar.src ? await photoUri(profile.avatar.src, 112, 112) : undefined,
    footer: site.role,
  });
  return cardResponse(png);
};
