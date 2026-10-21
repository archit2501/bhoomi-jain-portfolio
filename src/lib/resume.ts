import type { Figure, FigureInput, Post, Resume } from './content-schema';

/** How many entries each countable résumé list has: the source of "3 projects" and the like. */
export function resumeCounts(resume: Resume): Record<NonNullable<FigureInput['count']>, number> {
  return {
    projects: Object.keys(resume.projects).length,
    experience: Object.keys(resume.experience).length,
    education: Object.keys(resume.education).length,
    certifications: resume.certifications.length,
  };
}

/** Fills in every counted figure's value from the résumé. */
export function resolveFigures(
  figures: Record<string, FigureInput>,
  resume: Resume,
): Record<string, Figure> {
  const counts = resumeCounts(resume);
  return Object.fromEntries(
    Object.entries(figures).map(([id, { value, count, ...rest }]) => [
      id,
      { ...rest, ...(count && { count }), value: count ? String(counts[count]) : (value ?? '') },
    ]),
  );
}

/**
 * Phone numbers never appear on the site: ten or more digits, allowing spaces, dots, dashes,
 * brackets and a leading "+" between them. Years, ranges and figures stay well under ten.
 */
const PHONE = /\+?\(?\d(?:[\s.()-]*\d){9,}/g;

export function findPhoneNumbers(text: string): string[] {
  return [...text.matchAll(PHONE)].map((m) => m[0].trim());
}

type RefKind = Exclude<Post['kind'], 'log' | 'certification'>;
const REF_LIST: Record<RefKind, keyof Resume> = {
  project: 'projects',
  experience: 'experience',
  education: 'education',
  achievement: 'achievements',
};

/** The words a post's title must match exactly for each kind of résumé entry. */
function resumeTitle(resume: Resume, kind: RefKind, key: string): string | undefined {
  switch (kind) {
    case 'project':
      return resume.projects[key]?.name;
    case 'experience':
      return resume.experience[key]?.role;
    case 'education':
      return resume.education[key]?.degree;
    case 'achievement':
      return resume.achievements[key]?.title;
  }
}

/**
 * Keeps the posts honest to the résumé: each résumé entry has exactly one post, each post's title
 * is the résumé's own wording, and the certifications post names every certification.
 */
export function checkResume(
  resume: Resume,
  posts: { id: string; data: Post; body: string }[],
): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const { id, data, body } of posts) {
    const where = `post ${id}`;
    const { kind, resumeRef } = data;
    if (kind === 'log') {
      if (resumeRef) errors.push(`${where}: a log post can't point at the résumé`);
      continue;
    }
    if (!resumeRef) {
      errors.push(`${where}: a ${kind} post needs a resumeRef`);
      continue;
    }
    if (seen.has(resumeRef)) {
      errors.push(`${where}: "${resumeRef}" is already shown by post ${seen.get(resumeRef)}`);
    }
    seen.set(resumeRef, id);

    if (kind === 'certification') {
      if (resumeRef !== 'certifications') {
        errors.push(`${where}: a certification post points at "certifications"`);
      }
      for (const { name } of resume.certifications) {
        if (!body.includes(name)) errors.push(`${where}: the caption doesn't name "${name}"`);
      }
      continue;
    }

    const [list, key = ''] = resumeRef.split('/');
    if (list !== REF_LIST[kind]) {
      errors.push(`${where}: a ${kind} post points at "${REF_LIST[kind]}/…", not "${resumeRef}"`);
      continue;
    }
    const expected = resumeTitle(resume, kind, key);
    if (expected === undefined) {
      errors.push(`${where}: "${resumeRef}" isn't on the résumé`);
    } else if (data.title !== expected) {
      errors.push(`${where}: title "${data.title}" differs from the résumé's "${expected}"`);
    }
  }

  const expected = [
    ...Object.keys(resume.projects).map((k) => `projects/${k}`),
    ...Object.keys(resume.experience).map((k) => `experience/${k}`),
    ...Object.keys(resume.education).map((k) => `education/${k}`),
    ...Object.keys(resume.achievements).map((k) => `achievements/${k}`),
    ...(resume.certifications.length ? ['certifications'] : []),
  ];
  for (const ref of expected) {
    if (!seen.has(ref)) errors.push(`résumé "${ref}" has no post`);
  }
  return errors;
}
