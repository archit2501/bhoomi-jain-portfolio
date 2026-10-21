/**
 * GET /api/activity (task 4.2.3): the latest approved comments across her posts, for
 * Notifications. Only what's already public on the posts: the name, the post, a short excerpt.
 */
import type { Repo } from './db';

export const EXCERPT = 80;

export async function activityResponse(repo: Pick<Repo, 'comments'>): Promise<Response> {
  try {
    const comments = (await repo.comments.recent(20)).map((c) => ({
      id: c.id,
      post: c.post,
      name: c.name,
      excerpt: c.body.length > EXCERPT ? `${c.body.slice(0, EXCERPT - 1).trimEnd()}…` : c.body,
      at: new Date(c.publishedAt).toISOString(),
    }));
    return Response.json(
      { ok: true, comments },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch {
    return Response.json(
      { ok: false, error: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
