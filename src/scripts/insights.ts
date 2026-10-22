import { asOf, type GithubSnapshot } from '../lib/github';
import { heatmap } from '../lib/heatmap';
import type { SiteTotals } from '../lib/server/db';

/**
 * Insights (task 4.2.2): each panel loads its own source, and each says where its numbers come
 * from and when they were true, or that they're unavailable. Nothing has a placeholder number.
 */

const number = (n: number) => n.toLocaleString('en');
const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const plural = (n: number, one: string) => `${number(n)} ${one}${n === 1 ? '' : 's'}`;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function github(section: HTMLElement, snapshot: GithubSnapshot | null) {
  const state = section.querySelector<HTMLElement>('[data-github-state]')!;
  const body = section.querySelector<HTMLElement>('[data-github-body]')!;
  const source = section.querySelector<HTMLElement>('[data-github-source]')!;
  if (!snapshot) {
    state.textContent = 'Her GitHub activity is unavailable right now.';
    return;
  }
  for (const el of section.querySelectorAll<HTMLElement>('[data-figure]')) {
    const value = snapshot[el.dataset.figure as keyof GithubSnapshot];
    el.textContent = typeof value === 'number' ? number(value) : '';
  }

  // The calendar: one column per week, a summary for screen readers, and a table by month.
  const map = heatmap(snapshot.days);
  const heat = section.querySelector<HTMLElement>('[data-heat]')!;
  heat.replaceChildren(
    ...map.weeks.flatMap((week) =>
      week.map((cell) => {
        const span = document.createElement('span');
        span.className = cell ? 'cell' : 'cell empty';
        if (cell) {
          span.dataset.level = String(cell.level);
          span.title = `${plural(cell.count, 'contribution')} on ${day(cell.date)}`;
        }
        return span;
      }),
    ),
  );
  heat.setAttribute(
    'aria-label',
    `${plural(map.total, 'contribution')} in the past year, on ${plural(map.activeDays, 'day')}.` +
      (map.busiest
        ? ` Busiest day: ${day(map.busiest.date)}, with ${number(map.busiest.count)}.`
        : ''),
  );
  const months = section.querySelector<HTMLElement>('[data-heat-months]')!;
  months.replaceChildren(
    ...map.months.map(({ label, column }) => {
      const span = document.createElement('span');
      span.textContent = label;
      span.style.gridColumn = `${column + 1} / span 4`;
      return span;
    }),
  );
  const byMonth = new Map<string, number>();
  for (const { date, count } of snapshot.days) {
    const key = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    byMonth.set(key, (byMonth.get(key) ?? 0) + count);
  }
  section.querySelector('[data-heat-table] tbody')!.replaceChildren(
    ...[...byMonth].map(([month, count]) => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = month;
      const value = document.createElement('td');
      value.textContent = number(count);
      row.append(name, value);
      return row;
    }),
  );

  section.querySelector('[data-repos]')!.replaceChildren(
    ...snapshot.repos.slice(0, 6).map((repo) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = repo.url;
      link.textContent = repo.name;
      li.append(link);
      if (repo.description) {
        const description = document.createElement('p');
        description.textContent = repo.description;
        li.append(description);
      }
      const meta = document.createElement('p');
      meta.textContent = [
        repo.language,
        repo.stars ? `${plural(repo.stars, 'star')}` : null,
        `pushed ${day(repo.pushedAt.slice(0, 10))}`,
      ]
        .filter(Boolean)
        .join(' · ');
      li.append(meta);
      return li;
    }),
  );
  section.querySelector<HTMLAnchorElement>('[data-github-link]')!.href = snapshot.url;
  section.querySelector('[data-github-asof]')!.textContent = asOf(snapshot.fetchedAt);
  state.textContent = '';
  body.hidden = false;
  source.hidden = false;
}

interface LighthouseSummary {
  measuredAt: string;
  lighthouseVersion: string;
  source: string | null;
  pages: { path: string; scores: Record<string, number> }[];
}

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
/** Lighthouse's own bands: 90–100 good, 50–89 needs improvement, 0–49 poor. */
const rating = (score: number) =>
  score >= 90 ? ['good', 'good'] : score >= 50 ? ['average', 'needs work'] : ['poor', 'poor'];

function lighthouse(section: HTMLElement, summary: LighthouseSummary | null) {
  const state = section.querySelector<HTMLElement>('[data-lighthouse-state]')!;
  if (!summary?.pages?.length) {
    state.textContent = 'Not measured yet: the scores appear after the next deploy.';
    return;
  }
  section.querySelector('[data-lighthouse-rows]')!.replaceChildren(
    ...summary.pages.map((page) => {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      const code = document.createElement('code');
      code.textContent = page.path;
      name.append(code);
      row.append(name);
      for (const category of CATEGORIES) {
        const cell = document.createElement('td');
        const value = page.scores[category];
        if (typeof value === 'number') {
          const [band, words] = rating(value);
          const score = document.createElement('span');
          score.className = `score ${band}`;
          score.textContent = String(value);
          const hidden = document.createElement('span');
          hidden.className = 'visually-hidden';
          hidden.textContent = ` (${words})`;
          cell.append(score, hidden);
        }
        row.append(cell);
      }
      return row;
    }),
  );
  section.querySelector('[data-lighthouse-version]')!.textContent = summary.lighthouseVersion;
  const link = section.querySelector<HTMLAnchorElement>('[data-lighthouse-link]')!;
  if (summary.source) link.href = summary.source;
  section.querySelector('[data-lighthouse-asof]')!.textContent = asOf(summary.measuredAt);
  state.textContent = '';
  section.querySelector<HTMLElement>('[data-lighthouse-body]')!.hidden = false;
  section.querySelector<HTMLElement>('[data-lighthouse-source]')!.hidden = false;
}

function totals(section: HTMLElement, body: { measuredAt: string; totals: SiteTotals } | null) {
  const state = section.querySelector<HTMLElement>('[data-totals-state]')!;
  if (!body) {
    state.textContent = "This site's totals are unavailable right now.";
    return;
  }
  for (const el of section.querySelectorAll<HTMLElement>('[data-total]')) {
    el.textContent = number(body.totals[el.dataset.total as keyof SiteTotals]);
  }
  section.querySelector('[data-answered-label]')!.textContent =
    `Conversations she answered, of ${number(body.totals.conversations)}`;
  section.querySelector('[data-totals-asof]')!.textContent = asOf(body.measuredAt);
  state.textContent = '';
  section.querySelector<HTMLElement>('[data-totals-body]')!.hidden = false;
  section.querySelector<HTMLElement>('[data-totals-source]')!.hidden = false;
}

export function initInsights(): void {
  const sections = {
    github: document.querySelector<HTMLElement>('[data-github]'),
    lighthouse: document.querySelector<HTMLElement>('[data-lighthouse]'),
    totals: document.querySelector<HTMLElement>('[data-totals]'),
  };
  for (const section of Object.values(sections)) {
    const state = section?.querySelector<HTMLElement>('.state');
    if (state) state.textContent = 'Loading…';
  }
  if (sections.github) {
    void json<{ ok: boolean; snapshot?: GithubSnapshot }>('/api/github').then((body) =>
      github(sections.github!, body?.ok && body.snapshot ? body.snapshot : null),
    );
  }
  if (sections.lighthouse) {
    void json<LighthouseSummary>('/lighthouse.json').then((body) =>
      lighthouse(sections.lighthouse!, body),
    );
  }
  if (sections.totals) {
    void json<{ ok: boolean; measuredAt: string; totals: SiteTotals }>('/api/stats').then((body) =>
      totals(sections.totals!, body?.ok ? body : null),
    );
  }
}
