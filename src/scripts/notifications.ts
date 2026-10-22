import {
  commentActivity,
  githubActivity,
  groupActivity,
  newestFirst,
  relativeTime,
  type Activity,
} from '../lib/events';
import type { GithubSnapshot } from '../lib/github';

/**
 * Notifications (task 4.2.3): merges her GitHub events and approved comments into the career
 * milestones drawn at build time, newest first, and regroups them. "New" is what came since
 * this browser last looked: the notifications page, or the drawer once it's closed.
 */

const SEEN = 'bhoomi:notifications-seen';

function lastSeen(): number | null {
  try {
    const value = Number(localStorage.getItem(SEEN));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN, String(Date.now()));
  } catch {
    // Storage blocked: nothing is ever "New", which is fine.
  }
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function render(root: HTMLElement, items: Activity[], seen: number | null): void {
  const prefix = root.dataset.idPrefix ?? 'activity';
  const now = new Date();
  const icons = new Map(
    [...root.querySelectorAll<HTMLTemplateElement>('template[data-icon]')].map((t) => [
      t.dataset.icon!,
      t,
    ]),
  );
  const groups = groupActivity(items, now, seen);
  root.querySelector('[data-activity-groups]')!.replaceChildren(
    ...groups.map((group) => {
      const section = document.createElement('section');
      section.className = 'group';
      const id = `${prefix}-${group.label.replace(/\s+/g, '-')}`;
      section.setAttribute('aria-labelledby', id);
      const heading = document.createElement('h3');
      heading.id = id;
      heading.textContent = group.label;
      const list = document.createElement('ul');
      list.setAttribute('role', 'list');
      for (const item of group.items) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'row';
        a.href = item.href;
        if (item.external) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.setAttribute('aria-hidden', 'true');
        const icon = icons.get(item.kind);
        if (icon) badge.append(icon.content.cloneNode(true));
        const text = document.createElement('span');
        text.className = 'text';
        text.textContent = item.text;
        const when = document.createElement('time');
        when.className = 'when';
        when.dateTime = item.at;
        when.textContent = relativeTime(item.at, now);
        a.append(badge, text, when);
        if (item.external) {
          const note = document.createElement('span');
          note.className = 'visually-hidden';
          note.textContent = ' (opens GitHub)';
          a.append(note);
        }
        li.append(a);
        list.append(li);
      }
      section.append(heading, list);
      return section;
    }),
  );
  root.querySelector<HTMLElement>('[data-activity-empty]')!.hidden = items.length > 0;
}

export function initNotifications(): void {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-activity]')];
  if (!roots.length) return;
  const read = (root: HTMLElement, selector: string) =>
    JSON.parse(root.querySelector(selector)?.textContent ?? '[]');
  const seen = lastSeen();
  const onPage = location.pathname.startsWith('/notifications');

  let loaded = false;
  const load = async () => {
    if (loaded) return;
    loaded = true;
    const [github, activity] = await Promise.all([
      json<{ ok: boolean; snapshot?: GithubSnapshot }>('/api/github'),
      json<{ ok: boolean; comments: Parameters<typeof commentActivity>[0] }>('/api/activity'),
    ]);
    for (const root of roots) {
      const items = newestFirst(
        read(root, '[data-activity-career]') as Activity[],
        github?.ok && github.snapshot ? githubActivity(github.snapshot.events) : [],
        activity?.ok
          ? commentActivity(activity.comments, read(root, '[data-activity-titles]'))
          : [],
      );
      render(root, items, seen);
    }
    // The page counts as a look once it's shown; the drawer, once it's closed.
    if (onPage) markSeen();
  };

  // The notifications page loads at once; elsewhere the drawer loads the first time it opens,
  // so other pages don't ask for activity nobody looks at.
  const drawer = document.getElementById('panel-notifications');
  if (onPage) void load();
  else if (drawer) {
    new MutationObserver(() => {
      if (drawer.hasAttribute('open')) void load();
    }).observe(drawer, { attributes: true, attributeFilter: ['open'] });
  }
  drawer?.addEventListener('close', markSeen);
}
