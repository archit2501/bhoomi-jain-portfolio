/**
 * The Search panel's index (task 4.1.1): built once at build time and inlined as JSON, a few KB
 * for well under 200 items. Everything in it comes from her content: posts, highlights, reels,
 * every skill and certification on the résumé, and tags: the technologies her project posts were
 * built with and the labels on her screenshots.
 */
import type { SiteContent } from '../content-guards';
import { fieldOf, match, normalise, queryWords, type Match, type Searchable } from './match';

export const SEARCH_TABS = [
  { id: 'top', label: 'Top' },
  { id: 'projects', label: 'Projects' },
  { id: 'stack', label: 'Stack' },
  { id: 'tags', label: 'Tags' },
  { id: 'reels', label: 'Reels' },
] as const;
export type SearchTab = (typeof SEARCH_TABS)[number]['id'];

/** One thing the Search panel can find. */
export interface SearchItem {
  title: string;
  /** What kind of thing it is, shown under the title: "Project", "Skill · Front-End"… */
  kind: string;
  href: string;
  /** Extra words that should find it (stack, organisation, group, a reel's description). */
  keywords: string;
  /** The tab besides Top that lists it. Top lists everything. */
  tab?: Exclude<SearchTab, 'top'>;
}

const POST_KIND: Record<string, string> = {
  project: 'Project',
  experience: 'Experience',
  education: 'Education',
  achievement: 'Achievement',
  certification: 'Certifications',
  log: 'Post',
};

/** "#reactjs" for "ReactJS", "#nodejs" for "Node.js", "#awsec2" for "AWS EC2". */
export function tagName(label: string): string {
  return `#${normalise(label).replace(/[^a-z0-9+#]/g, '')}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Everything searchable, in the order ties are broken: posts first. O(n). */
export function buildSearchIndex(
  content: Pick<SiteContent, 'posts' | 'highlights' | 'reels' | 'resume'>,
): SearchItem[] {
  const { posts, highlights, reels, resume } = content;
  const stackOf = (ref?: string) =>
    ref?.startsWith('projects/') ? (resume.projects[ref.slice(9)]?.stack ?? []) : [];

  // Tags: what each post was built with, and what her screenshots are labelled with.
  const tags = new Map<string, { label: string; posts: Set<string> }>();
  for (const { id, data } of posts) {
    const labels = [
      ...stackOf(data.resumeRef),
      ...data.media.flatMap((m) => (m.type === 'image' ? m.tags.map((t) => t.label) : [])),
    ];
    for (const label of labels) {
      const name = tagName(label);
      const tag = tags.get(name) ?? { label, posts: new Set<string>() };
      tag.posts.add(id);
      tags.set(name, tag);
    }
  }
  const certifications = posts.find((p) => p.data.kind === 'certification');

  return [
    ...posts.map(({ id, data }) => ({
      title: data.title,
      kind: POST_KIND[data.kind],
      href: `/p/${id}/`,
      keywords: [data.org, ...stackOf(data.resumeRef)].filter(Boolean).join(' '),
      ...(data.kind === 'project' ? { tab: 'projects' as const } : {}),
    })),
    ...highlights
      .filter((h) => h.data.inRow)
      .map(({ id, data }) => ({
        title: data.label,
        kind: 'Highlight',
        href: `/stories/${id}/`,
        keywords: '',
      })),
    ...reels.map(({ id, data }) => ({
      title: data.title,
      kind: 'Reel',
      href: `/reels/${id}/`,
      keywords: data.description ?? '',
      tab: 'reels' as const,
    })),
    ...Object.entries(resume.skills).flatMap(([group, skills]) =>
      skills.map((skill) => ({
        title: skill,
        kind: `Skill · ${group}`,
        href: '/stories/stack/',
        keywords: group,
        tab: 'stack' as const,
      })),
    ),
    ...[...tags]
      .sort(([a, x], [b, y]) => y.posts.size - x.posts.size || a.localeCompare(b))
      .map(([name, { label, posts: tagged }]) => ({
        title: name,
        kind: `Tag · ${plural(tagged.size, 'post')}`,
        href: `/explore/?q=${encodeURIComponent(label)}`,
        keywords: label,
        tab: 'tags' as const,
      })),
    ...resume.certifications.map((cert) => ({
      title: cert.name,
      kind: cert.issuer ? `Certification · ${cert.issuer}` : 'Certification',
      href: certifications ? `/p/${certifications.id}/` : '/',
      keywords: cert.issuer ?? '',
    })),
  ];
}

/** An item with its words worked out once, when the panel loads. */
export interface Prepared {
  item: SearchItem;
  order: number;
  words: Searchable;
}

export function prepare(items: readonly SearchItem[]): Prepared[] {
  return items.map((item, order) => ({
    item,
    order,
    words: { title: fieldOf(item.title), keywords: fieldOf(item.keywords) },
  }));
}

/**
 * The items on a tab that match every word of the query, typos and all, best first; ties keep
 * index order. O(n·w·m·l) per keystroke (src/lib/search/match.ts).
 */
export function search(
  index: readonly Prepared[],
  query: string,
  tab: SearchTab = 'top',
  limit = 30,
): SearchItem[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const found: { entry: Prepared; match: Match }[] = [];
  for (const entry of index) {
    if (tab !== 'top' && entry.item.tab !== tab) continue;
    const result = match(words, entry.words);
    if (result) found.push({ entry, match: result });
  }
  return found
    .sort((a, b) => a.match.score - b.match.score || a.entry.order - b.entry.order)
    .slice(0, limit)
    .map((f) => f.entry.item);
}
