/**
 * Whether a Note has run out. `until` is as precise as she wrote it: "2026-11-30" ends that day,
 * "2026-11" at the end of November, "2026" at the end of the year. `today` is YYYY-MM-DD.
 */
export function noteExpired(until: string | undefined, today: string): boolean {
  if (!until) return false;
  return today.slice(0, until.length) > until;
}
