import type { APIRoute, GetStaticPaths } from 'astro';
import { loadPostArt, loadSiteContent } from '../../../lib/content';
import { cardResponse, photoUri, postSpec, renderCard } from '../../../lib/og-card';
import { site } from '../../../lib/site';

/** A post's share card: its cover, wide (task 6.3.5); a photo post shows the photo. */
export const getStaticPaths = (async () => {
  const { posts } = await loadSiteContent();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as Awaited<ReturnType<typeof getStaticPaths>>[number]['props'];
  const { profile } = await loadSiteContent();
  const art = (await loadPostArt()).get(post.id);
  if (!art) throw new Error(`No cover for post ${post.id}`);
  const image = post.data.media[0].type === 'image' ? post.data.media[0] : undefined;
  const text = post.data.media.find((m) => m.type === 'text');
  const png = await renderCard(
    postSpec(art.cover, art.field === 'photo' ? 'paper' : art.field, {
      head: [post.data.kind === 'education' ? 'Education' : post.data.title, post.data.dateLabel],
      footer: `${site.name} · ${site.role}`,
      avatar: profile.avatar.src ? await photoUri(profile.avatar.src, 112, 112) : undefined,
      photo: image ? await photoUri(image.src, 540, 630) : undefined,
      headline: text?.type === 'text' ? text.headline : post.data.title,
      detail: text?.type === 'text' ? text.detail : post.data.org,
    }),
  );
  return cardResponse(png);
};
