import type { Post } from './content-schema';

export type Slide = Post['media'][number];

/** Every word a slide shows, for the content checks ("is this figure actually on screen?"). */
export function slideText(slide: Slide): string {
  switch (slide.type) {
    case 'text':
      return [slide.headline, slide.detail].filter(Boolean).join(' ');
    case 'diagram':
      return [
        slide.title,
        ...slide.nodes.flatMap((n) => [n.label, n.detail]),
        ...slide.edges.map((e) => e.label),
      ]
        .filter(Boolean)
        .join(' ');
    case 'code':
      return slide.caption ?? '';
    case 'image':
      return slide.tags.map((t) => t.label).join(' ');
  }
}

/** What a grid tile or feed card shows for a slide that isn't a photo: a headline and a line. */
export function slideFace(slide: Exclude<Slide, { type: 'image' }>): {
  headline: string;
  detail?: string;
} {
  switch (slide.type) {
    case 'text':
      return { headline: slide.headline, detail: slide.detail };
    case 'diagram':
      return { headline: slide.title, detail: 'Architecture' };
    case 'code':
      return { headline: slide.caption ?? 'Code', detail: slide.lang };
  }
}

/** True when a post has at least one real photo or screen (not only text, diagrams or code). */
export const hasPhoto = (post: { data: Post }) => post.data.media.some((m) => m.type === 'image');
