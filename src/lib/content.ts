import { getCollection, getEntry } from 'astro:content';
import { assertContent, type SiteContent } from './content-guards';
import { resolveFigures } from './resume';
import { PROFILE_ID } from './site';

let cached: Promise<SiteContent> | undefined;

const byOrder = <T extends { data: { order: number } }>(a: T, b: T) => a.data.order - b.data.order;

/** Loads every collection once per build and runs the content checks on it. */
export function loadSiteContent(): Promise<SiteContent> {
  cached ??= (async () => {
    const profile = await getEntry('profile', PROFILE_ID);
    if (!profile) throw new Error(`src/content/profile.json needs a "${PROFILE_ID}" entry`);
    const resume = await getEntry('resume', PROFILE_ID);
    if (!resume) throw new Error(`src/content/resume.json needs a "${PROFILE_ID}" entry`);
    const figures = resolveFigures(
      Object.fromEntries((await getCollection('figures')).map((f) => [f.id, f.data] as const)),
      resume.data,
    );
    const posts = (await getCollection('posts'))
      .map((p) => ({ id: p.id, data: p.data, body: p.body ?? '' }))
      .sort((a, b) => Number(b.data.pinned) - Number(a.data.pinned) || byOrder(a, b));
    const highlights = (await getCollection('highlights'))
      .map((h) => ({ id: h.id, data: h.data }))
      .sort(byOrder);
    const reels = (await getCollection('reels'))
      .map((r) => ({ id: r.id, data: r.data }))
      .sort(byOrder);
    const events = (await getCollection('events'))
      .map((e) => ({ id: e.id, data: e.data }))
      .sort((a, b) => b.data.date.localeCompare(a.data.date));
    const dmThreads = (await getCollection('dmThreads'))
      .map((t) => ({ id: t.id, data: t.data }))
      .sort(byOrder);

    const content: SiteContent = {
      profile: profile.data,
      resume: resume.data,
      figures,
      posts,
      highlights,
      reels,
      events,
      dmThreads,
    };
    assertContent(content, { requireVerified: process.env.REQUIRE_VERIFIED === '1' });
    return content;
  })();
  return cached;
}
