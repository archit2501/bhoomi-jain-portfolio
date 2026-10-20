import { getCollection, getEntry } from 'astro:content';
import { assertContent, type SiteContent } from './content-guards';
import { PROFILE_ID } from './site';

let cached: Promise<SiteContent> | undefined;

/** Loads every collection once per build and runs the content checks on it. */
export function loadSiteContent(): Promise<SiteContent> {
  cached ??= (async () => {
    const profile = await getEntry('profile', PROFILE_ID);
    if (!profile) throw new Error(`src/content/profile.json needs a "${PROFILE_ID}" entry`);
    const figures = Object.fromEntries(
      (await getCollection('figures')).map((f) => [f.id, f.data] as const),
    );
    const posts = (await getCollection('posts'))
      .map((p) => ({ id: p.id, data: p.data, body: p.body ?? '' }))
      .sort((a, b) => Number(b.data.pinned) - Number(a.data.pinned) || a.data.order - b.data.order);
    const highlights = (await getCollection('highlights'))
      .map((h) => ({ id: h.id, data: h.data }))
      .sort((a, b) => a.data.order - b.data.order);
    const reels = (await getCollection('reels'))
      .map((r) => ({ id: r.id, data: r.data }))
      .sort((a, b) => a.data.order - b.data.order);

    const content: SiteContent = { profile: profile.data, figures, posts, highlights, reels };
    assertContent(content, { requireVerified: process.env.REQUIRE_VERIFIED === '1' });
    return content;
  })();
  return cached;
}
