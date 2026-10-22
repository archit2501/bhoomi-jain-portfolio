/**
 * The home feed as a dev log (task 4.1.3): newest work first, and the lens switch in the right
 * rail that narrows it to Frontend, Backend or AI. A post's lenses come from her own words, never
 * from a hand-picked list: it's Frontend or Backend when its text (the post, and the résumé entry
 * it stands for) names a skill from that group on her résumé, and AI when it says "AI".
 */
import type { Post, Resume } from './content-schema';

export const LENSES = [
  { id: 'all', label: 'All' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend' },
  { id: 'ai', label: 'AI' },
] as const;
export type Lens = Exclude<(typeof LENSES)[number]['id'], 'all'>;

/** Which résumé skill group each lens reads from. */
const GROUPS: Record<Exclude<Lens, 'ai'>, string> = {
  frontend: 'Front-End',
  backend: 'Back-End & APIs',
};

type FeedPost = { id: string; data: Post; body: string };

/**
 * The words that stand for a skill: "Tailwind CSS" is also "Tailwind", "ReactJS" also "React",
 * "SASS/LESS" both, "JavaScript (ES6+)" just "JavaScript".
 */
export function skillTerms(skill: string): string[] {
  const base = skill.replace(/\s*\(.*\)\s*$/, '').trim();
  const terms = new Set<string>();
  for (const part of base.split('/')) {
    const name = part.trim();
    if (!name) continue;
    terms.add(name);
    const short = name.replace(/(\.js|JS)$/, '');
    if (short.length >= 3 && short !== name) terms.add(short);
    const first = name.split(/\s+/)[0];
    if (first.length >= 3 && first !== name) terms.add(first);
  }
  return [...terms];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A whole word or name, as written: "REST" is not "rest", "Node.js" is not "Node.jsx". */
const mentions = (text: string, term: string) =>
  new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`).test(text);

/** Everything a post says about itself: title, organisation, caption and its résumé entry. */
export function postText(post: FeedPost, resume: Resume): string {
  const parts = [post.data.title, post.data.org ?? '', post.body];
  const ref = post.data.resumeRef ?? '';
  const [list, key] = ref.split('/');
  if (list === 'projects' && resume.projects[key]) {
    const p = resume.projects[key];
    parts.push(p.name, p.subtitle ?? '', p.stack.join(', '), ...p.bullets);
  } else if (list === 'experience' && resume.experience[key]) {
    const job = resume.experience[key];
    parts.push(job.role, job.org, ...job.bullets);
  } else if (list === 'achievements' && resume.achievements[key]) {
    const a = resume.achievements[key];
    parts.push(a.title, a.detail);
  } else if (list === 'education' && resume.education[key]) {
    const school = resume.education[key];
    parts.push(school.degree, school.school);
  } else if (ref === 'certifications') {
    parts.push(...resume.certifications.map((c) => c.name));
  }
  return parts.join('\n');
}

/** The lenses a post shows under. O(s·t) for s skills and t characters of text. */
export function lensesOf(post: FeedPost, resume: Resume): Lens[] {
  const text = postText(post, resume);
  const lenses: Lens[] = [];
  for (const [lens, group] of Object.entries(GROUPS) as [Exclude<Lens, 'ai'>, string][]) {
    const skills = resume.skills[group] ?? [];
    if (skills.some((skill) => skillTerms(skill).some((term) => mentions(text, term)))) {
      lenses.push(lens);
    }
  }
  if (mentions(text, 'AI')) lenses.push('ai');
  return lenses;
}

/** Newest first, by the date each post gives; posts without one go last; ties keep `order`. */
export function feedOrder<T extends { data: Pick<Post, 'date' | 'order'> }>(
  posts: readonly T[],
): T[] {
  return [...posts].sort(
    (a, b) => (b.data.date ?? '').localeCompare(a.data.date ?? '') || a.data.order - b.data.order,
  );
}
