/**
 * GET /api/stats (task 4.2.2): this site's real totals for Insights, as the database has them
 * now, with that time. Totals only; if the database doesn't answer, "unavailable", never zeros.
 */
import type { Repo } from './db';

export async function statsResponse(repo: Pick<Repo, 'totals'>, now = () => new Date()) {
  try {
    const totals = await repo.totals.site();
    return Response.json(
      { ok: true, measuredAt: now().toISOString(), totals },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch {
    return Response.json(
      { ok: false, error: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
