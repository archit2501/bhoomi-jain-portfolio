import {
  LIMITS,
  type DmThread,
  type Event,
  type Figure,
  type Highlight,
  type Post,
  type Profile,
  type Reel,
  type Resume,
} from './content-schema';
import { checkResume, findPhoneNumbers } from './resume';
import { hasPhoto, slideText } from './slides';

export interface SiteContent {
  profile: Profile;
  resume: Resume;
  /** Resolved: counted figures already carry their value from the résumé. */
  figures: Record<string, Figure>;
  posts: { id: string; data: Post; body: string }[];
  highlights: { id: string; data: Highlight }[];
  reels: { id: string; data: Reel }[];
  events: { id: string; data: Event }[];
  dmThreads: { id: string; data: DmThread }[];
}

/** Every résumé entry an event may point at, as "list/key" (or "certifications"). */
function resumeRefs(resume: Resume): Set<string> {
  return new Set([
    ...Object.keys(resume.projects).map((k) => `projects/${k}`),
    ...Object.keys(resume.experience).map((k) => `experience/${k}`),
    ...Object.keys(resume.education).map((k) => `education/${k}`),
    ...Object.keys(resume.achievements).map((k) => `achievements/${k}`),
    'certifications',
  ]);
}

export interface GuardOptions {
  /** Set by the deploy build: unverified figures become errors. */
  requireVerified: boolean;
}

export interface GuardResult {
  errors: string[];
  /** "id: value label" for every figure not yet marked verified. */
  unverified: string[];
}

/**
 * Cross-entry checks the per-entry schemas can't express. Runs in O(n) over all
 * entries and the figures they reference.
 */
export function checkContent(content: SiteContent, options: GuardOptions): GuardResult {
  const errors: string[] = [];
  const { figures } = content;

  const requireFigure = (where: string, id: string): Figure | undefined => {
    const figure = figures[id];
    if (!figure) errors.push(`${where}: unknown figure "${id}"`);
    return figure;
  };
  const requireMention = (where: string, id: string, text: string) => {
    const figure = requireFigure(where, id);
    if (figure && !text.includes(figure.value)) {
      errors.push(`${where}: figure "${id}" (${figure.value}) is listed but never shown`);
    }
  };

  content.profile.stats.forEach((id) => requireFigure('profile stats', id));

  const orders = new Set<number>();
  let pinned = 0;
  for (const { id, data, body } of content.posts) {
    const where = `post ${id}`;
    const caption = body.trim();
    if (!caption) errors.push(`${where}: caption is empty`);
    if (caption.length > LIMITS.caption) {
      errors.push(`${where}: caption is ${caption.length} characters, limit is ${LIMITS.caption}`);
    }
    if (orders.has(data.order)) errors.push(`${where}: order ${data.order} is already used`);
    orders.add(data.order);
    if (data.pinned) pinned++;
    const shown = [caption, ...data.media.map(slideText), data.tldr ?? ''].join(' ');
    data.figures.forEach((fid) => requireMention(where, fid, shown));
  }
  if (pinned > LIMITS.pinned) {
    errors.push(`${pinned} posts are pinned, limit is ${LIMITS.pinned}`);
  }

  for (const { id, data } of content.highlights) {
    const shown = data.frames
      .map((f) => (f.type === 'text' ? `${f.heading ?? ''} ${f.body}` : (f.caption ?? '')))
      .join(' ');
    data.figures.forEach((fid) => requireMention(`highlight ${id}`, fid, shown));
  }

  for (const { id, data } of content.reels) {
    requireMention(`reel ${id}`, data.figure, data.title);
  }

  errors.push(...checkResume(content.resume, content.posts));

  const refs = resumeRefs(content.resume);
  for (const { id, data } of content.events) {
    if (data.ref && !refs.has(data.ref)) {
      errors.push(`event ${id}: "${data.ref}" isn't on the résumé`);
    }
  }

  const threadOrders = new Set<number>();
  for (const { id, data } of content.dmThreads) {
    if (threadOrders.has(data.order))
      errors.push(`dm thread ${id}: order ${data.order} is already used`);
    threadOrders.add(data.order);
  }
  if (content.dmThreads.filter((t) => t.data.ai).length > 1) {
    errors.push('only one DM thread can be the AI assistant');
  }

  // Her phone number is on the résumé PDF but never on the site, in any field of any entry.
  const phones = findPhoneNumbers(JSON.stringify({ ...content, resume: undefined }));
  phones.push(...findPhoneNumbers(JSON.stringify(content.resume)));
  for (const phone of phones) errors.push(`a phone number is in the content: "${phone}"`);

  // Real photos and screens are what make it look like Instagram. Until they arrive the grid uses
  // text tiles; a production build allows one text post (a deliberate quote), not a grid of them.
  const textOnly = content.posts.filter((p) => !hasPhoto(p));
  if (options.requireVerified && textOnly.length > 1) {
    errors.push(
      `${textOnly.length} posts have no photo or screen (one text post is allowed): ${textOnly.map((p) => p.id).join(', ')}`,
    );
  }

  const unverified = Object.entries(figures)
    .filter(([, f]) => !f.verified)
    .map(([fid, f]) => `${fid}: ${f.value} ${f.label}`);
  if (options.requireVerified && unverified.length) {
    errors.push(`Unconfirmed figures block this build:\n  - ${unverified.join('\n  - ')}`);
  }

  return { errors, unverified };
}

/** Throws on any error so the build fails; reports unverified figures either way. */
export function assertContent(
  content: SiteContent,
  options: GuardOptions,
  log: (message: string) => void = console.log,
): GuardResult {
  const result = checkContent(content, options);
  if (result.errors.length) {
    throw new Error(`Content checks failed:\n- ${result.errors.join('\n- ')}`);
  }
  if (result.unverified.length) {
    log(
      `[content] ${result.unverified.length} figures not yet confirmed (the deploy build will refuse them):\n  - ${result.unverified.join('\n  - ')}`,
    );
  }
  return result;
}
