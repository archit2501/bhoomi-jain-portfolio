/**
 * /api/likes/<target>: GET reads the count and whether this visitor liked it; POST likes and
 * DELETE unlikes, both idempotent per visitor and through the full write pipeline. A target is a
 * post's slug or "reel-<id>", and only real ones are accepted. Every count comes from the database.
 */
import { readFlags } from './flags';
import { defineWrite, errorResponse, visitorFrom, type Platform } from './guard';

export function likesApi(targets: ReadonlySet<string>) {
  const write = (liked: boolean, target: string) =>
    defineWrite({
      flag: 'likes',
      kind: 'like',
      parse: () => ({}),
      run: async (_input, { visitor, repo }) => {
        if (liked) await repo.likes.add(target, visitor);
        else await repo.likes.remove(target, visitor);
        return Response.json({ ok: true, liked, count: await repo.likes.count(target) });
      },
    });

  const known = (target: string | undefined): target is string =>
    typeof target === 'string' && targets.has(target);

  return {
    async get(request: Request, target: string | undefined, platform: Platform) {
      if (!known(target)) return errorResponse('not_found', 404);
      if (!(await readFlags(platform.flags)).likes) return errorResponse('disabled', 503);
      const visitor = visitorFrom(request.headers.get('Cookie'));
      const [count, liked] = await Promise.all([
        platform.repo.likes.count(target),
        visitor ? platform.repo.likes.has(target, visitor) : Promise.resolve(false),
      ]);
      return Response.json(
        { ok: true, liked, count },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    },
    async post(request: Request, target: string | undefined, platform: Platform) {
      if (!known(target)) return errorResponse('not_found', 404);
      return write(true, target)(request, platform);
    },
    async delete(request: Request, target: string | undefined, platform: Platform) {
      if (!known(target)) return errorResponse('not_found', 404);
      return write(false, target)(request, platform);
    },
  };
}
