import { z } from 'astro/zod';
import { POST_DATE } from './post-date';

/** Instagram's own limits, kept so the profile reads like the real thing. */
export const LIMITS = { bio: 150, caption: 2200, pinned: 3 } as const;

const text = z.string().trim().min(1);
const altText = z.string().trim().min(1, 'Alt text is required');

/** A claim shown on the site. Every build lists the unverified ones; the deploy build refuses them. */
export const figureSchema = z.object({
  value: text,
  label: text,
  source: text,
  verified: z.boolean(),
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

export const postSchema = z.object({
  title: text,
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

export type Figure = z.infer<typeof figureSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Post = z.infer<typeof postSchema>;
export type Highlight = z.infer<typeof highlightSchema>;
export type Reel = z.infer<typeof reelSchema>;
