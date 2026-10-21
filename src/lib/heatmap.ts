/**
 * The contribution heatmap on Insights (task 4.2.2), laid out as GitHub draws it: one column per
 * week, Sunday at the top, each day shaded by how many contributions it had. Levels split the
 * busy days into quartiles, so one big day doesn't wash out the rest. O(d) for d days (≤ 371).
 */
import type { GithubDay } from './github';

export interface HeatCell {
  date: string;
  count: number;
  /** 0 for none, then 1–4 by quartile of the days that had any. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface Heatmap {
  /** Columns of seven (Sunday first); null where the year starts or ends mid-week. */
  weeks: (HeatCell | null)[][];
  /** A label where each month starts: the column it starts in. */
  months: { label: string; column: number }[];
  total: number;
  activeDays: number;
  busiest: { date: string; count: number } | null;
  /** The highest count in each level, for the legend. */
  thresholds: [number, number, number];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day of the week (0 = Sunday) of a YYYY-MM-DD date, in UTC. */
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function heatmap(days: readonly GithubDay[]): Heatmap {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const busy = sorted
    .map((d) => d.count)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const at = (q: number) => busy[Math.min(busy.length - 1, Math.floor(q * busy.length))] ?? 0;
  const thresholds: [number, number, number] = [at(0.25), at(0.5), at(0.75)];
  const level = (count: number): HeatCell['level'] =>
    count === 0
      ? 0
      : count <= thresholds[0]
        ? 1
        : count <= thresholds[1]
          ? 2
          : count <= thresholds[2]
            ? 3
            : 4;

  const weeks: (HeatCell | null)[][] = [];
  const months: Heatmap['months'] = [];
  let week: (HeatCell | null)[] = [];
  let lastMonth = -1;
  let busiest: Heatmap['busiest'] = null;
  let total = 0;
  for (const [i, day] of sorted.entries()) {
    const dow = weekday(day.date);
    if (i === 0) week = Array.from({ length: dow }, () => null);
    else if (dow === 0) {
      weeks.push(week);
      week = [];
    }
    week.push({ date: day.date, count: day.count, level: level(day.count) });
    const month = Number(day.date.slice(5, 7)) - 1;
    if (month !== lastMonth) {
      // Label a month in the first full column it has, as GitHub does.
      const column = dow === 0 || i === 0 ? weeks.length : weeks.length + 1;
      if (!months.length || months[months.length - 1].column < column) {
        months.push({ label: MONTHS[month], column });
      }
      lastMonth = month;
    }
    total += day.count;
    if (!busiest || day.count > busiest.count) busiest = { date: day.date, count: day.count };
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return {
    weeks,
    months,
    total,
    activeDays: busy.length,
    busiest: busiest && busiest.count > 0 ? busiest : null,
    thresholds,
  };
}
