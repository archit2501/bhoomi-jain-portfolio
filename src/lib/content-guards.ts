import {
  LIMITS,
  type Figure,
  type Highlight,
  type Post,
  type Profile,
  type Reel,
} from './content-schema';

export interface SiteContent {
  profile: Profile;
  figures: Record<string, Figure>;
  posts: { id: string; data: Post; body: string }[];
  highlights: { id: string; data: Highlight }[];
  reels: { id: string; data: Reel }[];
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
    const shown = [
      caption,
      ...data.media.map((m) => (m.type === 'text' ? `${m.headline} ${m.detail ?? ''}` : '')),
    ].join(' ');
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
