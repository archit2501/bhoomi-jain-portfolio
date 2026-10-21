import type { SiteContent } from './content-guards';

/** One thing the Search panel can find. Built once at build time and inlined as JSON. */
export interface SearchItem {
  title: string;
  /** What kind of thing it is, shown under the title: "Project", "Highlight", "Skill"… */
  kind: string;
  href: string;
  /** Extra words that should find it (stack, organisation, category). */
  keywords: string;
}

const POST_KIND: Record<string, string> = {
  project: 'Project',
  experience: 'Experience',
  education: 'Education',
  achievement: 'Achievement',
  certification: 'Certifications',
  log: 'Post',
};

/** Everything searchable: posts, highlights, reels and every skill on the résumé. O(n). */
export function buildSearchIndex(content: SiteContent): SearchItem[] {
  const { posts, highlights, reels, resume } = content;
  const stackOf = (ref?: string) =>
    ref?.startsWith('projects/') ? (resume.projects[ref.slice(9)]?.stack.join(' ') ?? '') : '';
  return [
    ...posts.map(({ id, data }) => ({
      title: data.title,
      kind: POST_KIND[data.kind],
      href: `/p/${id}/`,
      keywords: [data.org, stackOf(data.resumeRef)].filter(Boolean).join(' '),
    })),
    ...highlights
      .filter((h) => h.data.inRow)
      .map(({ id, data }) => ({
        title: data.label,
        kind: 'Highlight',
        href: `/stories/${id}/`,
        keywords: '',
      })),
    ...reels.map(({ data }) => ({
      title: data.title,
      kind: 'Reel',
      href: '/reels/',
      keywords: '',
    })),
    ...Object.entries(resume.skills).flatMap(([group, skills]) =>
      skills.map((skill) => ({
        title: skill,
        kind: `Skill · ${group}`,
        href: '/stories/stack/',
        keywords: group,
      })),
    ),
  ];
}

const normalise = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/**
 * Items whose title or keywords contain every word of the query, best first: a title that
 * starts with the query, then a title that contains it, then keyword-only matches.
 * O(n·m) for n items and a query of m characters.
 */
export function search(items: readonly SearchItem[], query: string, limit = 20): SearchItem[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const phrase = words.join(' ');
  return items
    .map((item, order) => {
      const title = normalise(item.title);
      const all = `${title} ${normalise(item.keywords)}`;
      if (!words.every((w) => all.includes(w))) return undefined;
      const rank = title.startsWith(phrase) ? 0 : title.includes(phrase) ? 1 : 2;
      return { item, rank, order };
    })
    .filter((r) => r !== undefined)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((r) => r.item);
}
