import { describe, expect, it } from 'vitest';
import { statsResponse } from './stats';

const totals = { likes: 12, comments: 3, conversations: 4, answered: 2, votes: 9 };

describe('GET /api/stats', () => {
  it('the totals, with when they were read', async () => {
    const res = await statsResponse(
      { totals: { site: async () => totals } },
      () => new Date('2026-10-22T14:07:00Z'),
    );
    expect(await res.json()).toEqual({ ok: true, measuredAt: '2026-10-22T14:07:00.000Z', totals });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('unavailable, never zeros, when the database fails', async () => {
    const res = await statsResponse({
      totals: {
        site: async () => {
          throw new Error('down');
        },
      },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'unavailable' });
  });
});
