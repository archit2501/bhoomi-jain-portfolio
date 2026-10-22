/**
 * Post covers (task 6.2.1): what a post's grid tile and feed card show, worked out from her
 * content by kind. A project shows its title and the layers it's built from; a win, a job or a
 * certificate shows its number large, with a pictogram that draws that number and nothing more;
 * a degree shows its name and how far through it she is. Every word comes from the post, its
 * figures or her résumé (covers.test.ts checks); the only other words are structural labels.
 */
import type { Figure, Post, Resume } from './content-schema';

/** A shape that depicts one stated number, never an invented one. */
export type Picto =
  /** "1st of 160": 160 dots, one lit for her place. */
  | { type: 'dots'; total: number; lit: number }
  /** "4 dashboards", "12+ modules", "5 certifications": one mark per thing, a plus if "+". */
  | { type: 'units'; count: number; plus: boolean; shape: 'square' | 'card' }
  /** "35% longer", "40% lower": a bar and its change, unitless (no axis, no "before" value). */
  | { type: 'change'; percent: number; direction: 'up' | 'down' };

/** The running head: the left label (kind, org) and the right one (dates), when there are any. */
export type Head = readonly [string, string?];

export type Cover =
  | {
      layout: 'project';
      head: Head;
      title: string;
      deck?: string;
      /** The layers from its architecture diagram, in order. */
      layers: string[];
      stack: string[];
    }
  | {
      layout: 'stat';
      head: Head;
      /** Shown instead of the head on a small tile, so a job always names the company. */
      who?: string;
      hero: string;
      label?: string;
      /** A second, quieter line: where the number is from. */
      detail?: string;
      picto?: Picto;
    }
  | {
      layout: 'title';
      head: Head;
      title: string;
      label?: string;
      /** Elapsed share of a dated span (a degree in progress), 0 to 1, with its end labels. */
      timeline?: { from: string; to: string; note?: string; progress: number };
    }
  | { layout: 'photo' };

const KIND_LABEL: Record<Post['kind'], string> = {
  project: 'Project',
  experience: 'Experience',
  education: 'Education',
  achievement: 'Achievement',
  certification: 'Certifications',
  log: 'Post',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jul 2025 – Jun 2027 (expected)": the start and end months, and the note. */
export function parseSpan(
  label: string,
): { from: string; to: string; fromDate: Date; toDate: Date; note?: string } | undefined {
  const months = [...label.matchAll(/\b([A-Z][a-z]{2}) (\d{4})\b/g)];
  if (months.length < 2) return undefined;
  const [from, to] = [months[0], months[months.length - 1]];
  const date = (m: RegExpMatchArray) => new Date(Date.UTC(Number(m[2]), MONTHS.indexOf(m[1]), 1));
  const note = /\(([^)]+)\)/.exec(label)?.[1];
  return { from: from[0], to: to[0], fromDate: date(from), toDate: date(to), note };
}

/** The pictogram for a hero number and its words, or none when the number isn't drawable. */
export function pictoFor(hero: string, words: string, kind: Post['kind']): Picto | undefined {
  const rank = /^(\d+)(?:st|nd|rd|th)$/.exec(hero);
  const of = /\bof (\d+)\b/.exec(words);
  if (rank && of && Number(of[1]) <= 400) {
    return { type: 'dots', total: Number(of[1]), lit: Number(rank[1]) };
  }
  const percent = /^~?(\d+)%$/.exec(hero);
  if (percent) {
    if (/\b(longer|more|higher|faster|up)\b/.test(words)) {
      return { type: 'change', percent: Number(percent[1]), direction: 'up' };
    }
    if (/\b(lower|fewer|less|shorter|down)\b/.test(words)) {
      return { type: 'change', percent: Number(percent[1]), direction: 'down' };
    }
    return undefined;
  }
  const count = /^(\d+)(\+?)$/.exec(hero);
  if (count && Number(count[1]) >= 2 && Number(count[1]) <= 12) {
    return {
      type: 'units',
      count: Number(count[1]),
      plus: count[2] === '+',
      shape: kind === 'certification' ? 'card' : 'square',
    };
  }
  return undefined;
}

export interface CoverPost {
  data: Post;
}

/**
 * A post's cover. `now` dates the progress of a degree in progress (the build date); figures
 * and the résumé give the stat words and a project's stack. O(slides + stack).
 */
export function coverFor(
  { data }: CoverPost,
  figures: Record<string, Figure>,
  resume: Pick<Resume, 'projects'>,
  now = new Date(),
): Cover {
  const first = data.media[0];
  if (first.type === 'image') return { layout: 'photo' };
  const headline = first.type === 'text' ? first.headline : data.title;
  const detail = first.type === 'text' ? first.detail : undefined;
  const kind = KIND_LABEL[data.kind];

  if (data.kind === 'project') {
    const diagram = data.media.find((m) => m.type === 'diagram');
    const ref = data.resumeRef?.startsWith('projects/') ? data.resumeRef.slice(9) : undefined;
    return {
      layout: 'project',
      head: [kind, data.dateLabel],
      title: headline,
      deck: detail,
      layers: diagram?.type === 'diagram' ? diagram.nodes.map((n) => n.label) : [],
      stack: ((ref && resume.projects[ref]?.stack) || []).slice(0, 4),
    };
  }

  if (data.kind === 'education') {
    const span = data.dateLabel ? parseSpan(data.dateLabel) : undefined;
    const total = span ? span.toDate.getTime() - span.fromDate.getTime() : 0;
    const timeline =
      span && span.note && total > 0
        ? {
            from: span.from,
            to: span.to,
            note: span.note,
            progress: Math.min(1, Math.max(0, (now.getTime() - span.fromDate.getTime()) / total)),
          }
        : undefined;
    return {
      layout: 'title',
      head: [kind, data.dateLabel?.replace(/\s*\([^)]*\)$/, '')],
      title: headline,
      label: detail ?? data.org,
      timeline,
    };
  }

  // A number post: its figure, when the headline starts with one ("1st" of "1st of 160"),
  // gives the hero and the words for it; otherwise the slide's own headline and detail.
  const figure = data.figures
    .map((id) => figures[id])
    .find((f) => f && headline.startsWith(f.value) && f.value !== headline);
  const hero = figure ? figure.value : headline;
  const label = figure ? figure.label : detail;
  const isNumber = /\d/.test(hero) && hero.length <= 10;
  if (!isNumber) {
    return { layout: 'title', head: [kind, data.dateLabel], title: headline, label: detail };
  }
  const org = data.kind === 'experience' ? data.org : undefined;
  return {
    layout: 'stat',
    head: [org ?? kind, data.dateLabel],
    who: org,
    hero,
    label,
    // When the figure took the label, the slide's own detail still says where it's from.
    detail: figure && detail !== label ? detail : undefined,
    picto: pictoFor(hero, `${label ?? ''} ${detail ?? ''}`, data.kind),
  };
}
