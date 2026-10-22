import type { APIRoute, GetStaticPaths } from 'astro';
import { loadSiteContent } from '../../../lib/content';
import { cardResponse, photoUri, renderCard } from '../../../lib/og-card';

/** Share cards for the app's own pages (task 6.3.5). */
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
  const photo = profile.avatar.src ? await photoUri(profile.avatar.src, 300, 300) : undefined;
  const png = await renderCard({
    field: 'paper',
    head: [profile.username, profile.category],
    big: headline,
    label: detail,
    art: photo ? { kind: 'portrait', src: photo } : undefined,
    footer: `${profile.displayName} · ${profile.category}`,
  });
  return cardResponse(png);
};
