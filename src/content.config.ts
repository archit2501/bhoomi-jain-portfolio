import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import {
  figureSchema,
  highlightSchema,
  postSchema,
  profileSchema,
  reelSchema,
} from './lib/content-schema';

export const collections = {
  profile: defineCollection({ loader: file('src/content/profile.json'), schema: profileSchema }),
  figures: defineCollection({ loader: file('src/content/figures.json'), schema: figureSchema }),
  posts: defineCollection({
    loader: glob({ pattern: '*.md', base: 'src/content/posts' }),
    schema: postSchema,
  }),
  highlights: defineCollection({
    loader: glob({ pattern: '*.json', base: 'src/content/highlights' }),
    schema: highlightSchema,
  }),
  reels: defineCollection({ loader: file('src/content/reels.json'), schema: reelSchema }),
};
