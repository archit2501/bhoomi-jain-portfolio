import { describe, expect, it } from 'vitest';
import { heatmap } from './heatmap';

const range = (start: string, counts: number[]) =>
  counts.map((count, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count };
  });

describe('heatmap', () => {
  it('lays days in weeks of seven, Sunday first, padding the ends', () => {
    // 2026-10-21 is a Wednesday.
    const map = heatmap(range('2026-10-21', [1, 0, 2, 0, 3, 4, 0, 5]));
    expect(map.weeks).toHaveLength(2);
    expect(map.weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(map.weeks[0][3]).toMatchObject({ date: '2026-10-21', count: 1 });
    expect(map.weeks[1][0]).toMatchObject({ date: '2026-10-25', count: 3 });
    expect(map.weeks[1].slice(4)).toEqual([null, null, null]);
    expect(map.weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('shades busy days by quartile, none at 0', () => {
    const map = heatmap(range('2026-01-04', [0, 1, 2, 3, 4, 8, 20, 0]));
    expect(map.weeks.flat().map((c) => c?.level)).toEqual([
      0,
      1,
      1,
      2,
      2,
      3,
      4,
      0,
      ...Array(6).fill(undefined),
    ]);
    // Busy days 1, 2, 3, 4, 8, 20: quartiles at 2, 4 and 8.
    expect(map.thresholds).toEqual([2, 4, 8]);
    expect(map.total).toBe(38);
    expect(map.activeDays).toBe(6);
    expect(map.busiest).toEqual({ date: '2026-01-10', count: 20 });
  });

  it('labels each month where it starts, never two in one column', () => {
    const map = heatmap(range('2026-01-25', Array(40).fill(1)));
    expect(map.months).toEqual([
      { label: 'Jan', column: 0 },
      { label: 'Feb', column: 1 },
      { label: 'Mar', column: 5 },
    ]);
  });

  it('a quiet year has no busiest day and nothing shaded', () => {
    const map = heatmap(range('2026-03-01', [0, 0, 0]));
    expect(map.busiest).toBeNull();
    expect(map.total).toBe(0);
    expect(map.weeks.flat().every((c) => !c || c.level === 0)).toBe(true);
    expect(heatmap([]).weeks).toEqual([]);
  });

  it('a full year is 53 weeks or so, in order whatever order it arrives in', () => {
    const year = range(
      '2025-10-19',
      Array(371)
        .fill(0)
        .map((_, i) => i % 5),
    );
    const map = heatmap([...year].reverse());
    expect(map.weeks).toHaveLength(53);
    expect(map.weeks[0][0]?.date).toBe('2025-10-19');
  });
});
