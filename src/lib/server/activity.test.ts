import { describe, expect, it } from 'vitest';
import { activityResponse, EXCERPT } from './activity';

const comment = (body: string, publishedAt: number) => ({
  id: 'c1',
  post: 'smartblog-ai',
  name: 'Priya',
  body,
  status: 'approved' as const,
  createdAt: publishedAt - 1000,
  publishedAt,
});

describe('GET /api/activity', () => {
  it('approved comments as public lines: name, post, a short excerpt, when', async () => {
    const long = 'x'.repeat(200);
    const res = await activityResponse({
      comments: {
        recent: async () => [comment('Great work!', Date.UTC(2026, 9, 22, 9)), comment(long, 0)],
      } as never,
    });
    const body = (await res.json()) as { ok: boolean; comments: { excerpt: string; at: string }[] };
    expect(body.ok).toBe(true);
    expect(body.comments[0]).toEqual({
      id: 'c1',
      post: 'smartblog-ai',
      name: 'Priya',
      excerpt: 'Great work!',
      at: '2026-10-22T09:00:00.000Z',
    });
    expect(body.comments[1].excerpt).toHaveLength(EXCERPT);
    expect(body.comments[1].excerpt.endsWith('…')).toBe(true);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('unavailable when the database fails', async () => {
    const res = await activityResponse({
      comments: {
        recent: async () => {
          throw new Error('down');
        },
      } as never,
    });
    expect(res.status).toBe(503);
  });
});
