import { z } from 'astro/zod';
import { POST_DATE } from './post-date';

/** Instagram's own limits, kept so the profile reads like the real thing. */
export const LIMITS = { bio: 150, caption: 2200, pinned: 3 } as const;

const text = z.string().trim().min(1);
const altText = z.string().trim().min(1, 'Alt text is required');

/** The résumé lists a figure can count instead of a typed-in value. */
export const COUNTABLE = ['projects', 'experience', 'education', 'certifications'] as const;

/**
 * A claim shown on the site. Every build lists the unverified ones; the deploy build refuses them.
 * A figure either states its value or counts a résumé list ("count": "projects"), so numbers like
 * "3 projects" can't drift from the résumé.
 */
export const figureSchema = z
  .object({
    value: text.optional(),
    count: z.enum(COUNTABLE).optional(),
    label: text,
    source: text,
    verified: z.boolean(),
  })
  .refine((f) => (f.value === undefined) !== (f.count === undefined), {
    message: 'A figure needs exactly one of "value" or "count"',
  });

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

/** Her résumé, transcribed word for word. Posts, stats and the AI chat are checked against it. */
export const resumeSchema = z.object({
  source: text,
  name: text,
  location: text,
  email: z.email(),
  linkedin: z.url(),
  experience: z.record(
    z.string(),
    z.object({
      org: text,
      role: text,
      start: yearMonth,
      end: yearMonth,
      bullets: z.array(text).min(1),
    }),
  ),
  projects: z.record(
    z.string(),
    z.object({
      name: text,
      subtitle: text.optional(),
      years: text,
      stack: z.array(text).min(1),
      bullets: z.array(text).min(1),
    }),
  ),
  skills: z.record(z.string(), z.array(text).min(1)),
  education: z.record(
    z.string(),
    z.object({
      degree: text,
      school: text,
      start: yearMonth,
      end: yearMonth,
      expected: z.boolean().default(false),
    }),
  ),
  achievements: z.record(z.string(), z.object({ title: text, detail: text })),
  certifications: z.array(z.object({ name: text, issuer: text.optional() })).min(1),
});

/** The Notes bubble above her avatar: Instagram's one 60-character status, shown until `until`. */
export const noteSchema = z.object({
  text: z.string().trim().min(1).max(60, 'Notes are 60 characters or fewer'),
  until: z.string().regex(POST_DATE, 'Use YYYY, YYYY-MM or YYYY-MM-DD').optional(),
});

export const profileSchema = z.object({
  username: z
    .string()
    .regex(/^[a-z0-9._]{1,30}$/, 'Use 1-30 lowercase letters, numbers, dots or underscores'),
  displayName: text,
  category: text,
  bio: z.string().max(LIMITS.bio, `Bio must be ${LIMITS.bio} characters or fewer`),
  location: text,
  avatar: z.object({ src: text.optional(), alt: altText }),
  /** Figure ids for the three-number row under her name. */
  stats: z.array(text).length(3),
  links: z.object({
    linkedin: z.url(),
    resume: text.optional(),
    email: z.email().optional(),
  }),
  /** For search engines (schema.org Person); every value must be on her resume. */
  jobTitle: text.optional(),
  organization: z.object({ name: text, url: z.url() }).optional(),
  education: text.optional(),
  /** Her current Note, if she has one. Leave it out rather than invent one. */
  note: noteSchema.optional(),
});

const imageMedia = z.object({ type: z.literal('image'), src: text, alt: altText });
const textMedia = z.object({ type: z.literal('text'), headline: text, detail: text.optional() });
export const mediaSchema = z.discriminatedUnion('type', [imageMedia, textMedia]);

/** Comments under a post are real testimonials only: a named person and where it came from. */
export const testimonialSchema = z.object({
  quote: text,
  name: text,
  role: text.optional(),
  source: text,
});

/**
 * What a post is. Every kind but "log" shows one résumé entry, named by `resumeRef`
 * ("projects/smartblog-ai", "experience/themobiadz", "education/amity-bca",
 * "achievements/cybercup-4-winner", or "certifications" for the list).
 */
export const POST_KINDS = [
  'project',
  'experience',
  'education',
  'achievement',
  'certification',
  'log',
] as const;

export const postSchema = z.object({
  title: text,
  kind: z.enum(POST_KINDS),
  resumeRef: text.optional(),
  /** Project links: the code and the running app. */
  links: z.object({ repo: z.url().optional(), live: z.url().optional() }).default({}),
  order: z.number().int().positive(),
  pinned: z.boolean().default(false),
  /** As precise as the source says: YYYY, YYYY-MM or YYYY-MM-DD. Optional when it gives none. */
  date: z.string().regex(POST_DATE, 'Use YYYY, YYYY-MM or YYYY-MM-DD').optional(),
  /** Shown instead of the formatted date, e.g. "Jul – Sep 2023". */
  dateLabel: text.optional(),
  location: text.optional(),
  org: text.optional(),
  media: z.array(mediaSchema).min(1),
  figures: z.array(text).default([]),
  testimonials: z.array(testimonialSchema).default([]),
});

const frameTiming = { durationMs: z.number().int().min(1000).max(15000).optional() };
const textFrame = z.object({
  type: z.literal('text'),
  heading: text.optional(),
  body: text,
  ...frameTiming,
});
const imageFrame = z.object({
  type: z.literal('image'),
  src: text,
  alt: altText,
  caption: text.optional(),
  ...frameTiming,
});
export const frameSchema = z.discriminatedUnion('type', [textFrame, imageFrame]);

const highlightCover = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(4) }),
  imageMedia,
]);

export const highlightSchema = z
  .object({
    label: text,
    order: z.number().int().nonnegative(),
    /** False for the intro story, which opens from the avatar ring instead of the row. */
    inRow: z.boolean().default(true),
    cover: highlightCover,
    /** Privacy: a text-only highlight may never show a photo. */
    textOnly: z.boolean().default(false),
    figures: z.array(text).default([]),
    frames: z.array(frameSchema).min(1),
  })
  .refine(
    (h) => !h.textOnly || (h.cover.type === 'text' && h.frames.every((f) => f.type === 'text')),
    {
      message: 'This highlight is text-only for privacy, so its cover and frames cannot be images',
      path: ['frames'],
    },
  );

export const reelSchema = z.object({
  title: text,
  order: z.number().int().positive(),
  figure: text,
  /** Everything the reel shows on screen, for screen readers (the reels are silent). */
  description: text.optional(),
  video: text.optional(),
  poster: text.optional(),
  captions: text.optional(),
});

/** A dated line in her activity feed (task 4.2.3). `ref` points at a résumé entry or a post. */
export const eventSchema = z.object({
  date: z.string().regex(POST_DATE, 'Use YYYY, YYYY-MM or YYYY-MM-DD'),
  kind: z.enum(['job', 'education', 'project', 'achievement', 'certification', 'site']),
  title: text,
  org: text.optional(),
  ref: text.optional(),
  href: z.url().optional(),
});

/** A starter thread in Messages: what the visitor picks and how she answers first. */
export const dmThreadSchema = z.object({
  order: z.number().int().positive(),
  label: text,
  opener: z.string().trim().min(1).max(280, 'Keep a scripted reply to 280 characters'),
  /** The "Ask my AI" thread answers with the AI assistant (task 3.2.3) instead of reaching her. */
  ai: z.boolean().default(false),
});

/** A figure as the site shows it: counted figures get their value from the résumé. */
export type Figure = Omit<z.infer<typeof figureSchema>, 'value'> & { value: string };
export type FigureInput = z.infer<typeof figureSchema>;
export type Resume = z.infer<typeof resumeSchema>;
export type ResumeInput = z.input<typeof resumeSchema>;
export type PostKind = (typeof POST_KINDS)[number];
export type Event = z.infer<typeof eventSchema>;
export type Note = z.infer<typeof noteSchema>;
export type DmThread = z.infer<typeof dmThreadSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Post = z.infer<typeof postSchema>;
export type Highlight = z.infer<typeof highlightSchema>;
export type Reel = z.infer<typeof reelSchema>;
