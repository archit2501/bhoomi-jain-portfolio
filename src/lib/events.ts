/**
 * Notifications (task 4.2.3): her activity from three real sources, merged newest first and
 * grouped the way Instagram does. Career milestones (events.json, each linking to the post that
 * tells it), her public GitHub events (the hourly snapshot), and approved comments on her posts.
 * Every line links to where it came from; nothing is made up to fill the list.
 */
import type { Event } from './content-schema';
import type { GithubEvent } from './github';

export type ActivityKind = Event['kind'] | 'github' | 'comment';

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** The line, as plain text. */
  text: string;
  /** Where it came from. */
  href: string;
  /** A link off this site (GitHub). */
  external?: boolean;
  /** YYYY, YYYY-MM, YYYY-MM-DD or a full ISO time. */
  at: string;
}

export type GroupLabel = 'New' | 'Today' | 'This week' | 'Earlier';

/** A date or time as milliseconds: a partial date is its first moment, in UTC. */
export function toTime(at: string): number {
  if (/^\d{4}$/.test(at)) return Date.UTC(Number(at), 0, 1);
  if (/^\d{4}-\d{2}$/.test(at)) return Date.UTC(Number(at.slice(0, 4)), Number(at.slice(5)) - 1, 1);
  const t = Date.parse(at.length === 10 ? `${at}T00:00:00Z` : at);
  if (Number.isNaN(t)) throw new Error(`Not a date: "${at}"`);
  return t;
}

/** Merges lists into one, newest first; ties keep their order. O(e log e) for e items. */
export function newestFirst(...lists: Activity[][]): Activity[] {
  const all = lists.flat().map((item, i) => ({ item, i, t: toTime(item.at) }));
  // Array.prototype.sort is a stable merge sort (TimSort) in every engine the site supports.
  return all.sort((a, b) => b.t - a.t || a.i - b.i).map((x) => x.item);
}

const DAY = 24 * 60 * 60 * 1000;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Instagram's groups: "New" is what came since this browser last looked (only once it has
 * looked), then today, the past seven days, and everything earlier. Empty groups are left out.
 */
export function groupActivity(
  items: readonly Activity[],
  now: Date,
  lastSeen: number | null,
): { label: GroupLabel; items: Activity[] }[] {
  const groups: Record<GroupLabel, Activity[]> = {
    New: [],
    Today: [],
    'This week': [],
    Earlier: [],
  };
  for (const item of items) {
    const t = toTime(item.at);
    const precise = item.at.length > 10;
    if (lastSeen !== null && precise && t > lastSeen && t <= now.getTime()) groups.New.push(item);
    else if (precise && sameDay(new Date(t), now)) groups.Today.push(item);
    else if (precise && now.getTime() - t < 7 * DAY && t <= now.getTime())
      groups['This week'].push(item);
    else groups.Earlier.push(item);
  }
  return (Object.keys(groups) as GroupLabel[])
    .filter((label) => groups[label].length)
    .map((label) => ({ label, items: groups[label] }));
}

const MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "5m", "3h", "2d", "1w" for recent things; "Jul 2023" or "2024" for older ones, as given. */
export function relativeTime(at: string, now: Date): string {
  if (/^\d{4}$/.test(at)) return at;
  if (/^\d{4}-\d{2}$/.test(at)) return MONTH.format(toTime(at));
  const ago = now.getTime() - toTime(at);
  if (ago < 0) return MONTH.format(toTime(at));
  const minutes = Math.floor(ago / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w` : MONTH.format(toTime(at));
}

/** Her career milestones, each linking to the post that tells it (or its own link). */
export function careerActivity(
  events: readonly { id: string; data: Event }[],
  posts: readonly { id: string; data: { resumeRef?: string } }[],
): Activity[] {
  return events.flatMap(({ id, data }) => {
    const post = data.ref ? posts.find((p) => p.data.resumeRef === data.ref) : undefined;
    const href = data.href ?? (post ? `/p/${post.id}/` : null);
    if (!href) return [];
    return [
      {
        id: `event:${id}`,
        kind: data.kind,
        text: data.org ? `${data.title} · ${data.org}` : data.title,
        href,
        external: Boolean(data.href),
        at: data.date,
      },
    ];
  });
}

/** Her public GitHub events, from the snapshot. */
export function githubActivity(events: readonly GithubEvent[]): Activity[] {
  return events.map((e) => ({
    id: `github:${e.id}`,
    kind: 'github',
    text: `${e.summary} in ${e.repo}`,
    href: e.url,
    external: true,
    at: e.at,
  }));
}

/** Approved comments on her posts, by the post's title. */
export function commentActivity(
  comments: readonly { id: string; post: string; name: string; excerpt: string; at: string }[],
  titles: Readonly<Record<string, string>>,
): Activity[] {
  return comments
    .filter((c) => titles[c.post])
    .map((c) => ({
      id: `comment:${c.id}`,
      kind: 'comment',
      text: `${c.name} commented on ${titles[c.post]}: “${c.excerpt}”`,
      href: `/p/${c.post}/`,
      at: c.at,
    }));
}
