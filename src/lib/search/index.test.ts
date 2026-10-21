import { describe, expect, it } from 'vitest';
import type { SiteContent } from '../content-guards';
import { buildSearchIndex, prepare, search, tagName, type SearchItem } from './index';

const item = (title: string, keywords = '', tab?: SearchItem['tab']): SearchItem => ({
  title,
  kind: 'Project',
  href: `/${title}/`,
  keywords,
  ...(tab ? { tab } : {}),
});

const index = prepare([
  item('SmartBlog AI', 'ReactJS Node.js MongoDB', 'projects'),
  item('Conversational AI Web App', 'FastAPI AWS EC2', 'projects'),
  item('React Native (familiar)', 'Front-End', 'stack'),
  item('ReactJS', 'Front-End', 'stack'),
  item('#reactjs', 'ReactJS', 'tags'),
  item('Café Résumé'),
]);
const titles = (query: string, tab?: Parameters<typeof search>[2]) =>
  search(index, query, tab).map((i) => i.title);

describe('search', () => {
  it('finds nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([]);
  });

  it('ranks the same word, then its start, then keyword matches; ties keep index order', () => {
    expect(titles('reactjs')).toEqual(['ReactJS', '#reactjs', 'SmartBlog AI']);
    expect(titles('react')).toEqual([
      'React Native (familiar)',
      'ReactJS',
      '#reactjs',
      'SmartBlog AI',
    ]);
  });

  it("forgives typos: 'reakt' finds React", () => {
    expect(titles('reakt')[0]).toBe('React Native (familiar)');
    expect(titles('reakt native')).toEqual(['React Native (familiar)']);
    expect(titles('convrsational')).toEqual(['Conversational AI Web App']);
  });

  it('needs every word of the query, in any order', () => {
    expect(titles('ai app')).toEqual(['Conversational AI Web App']);
    expect(titles('mongodb blog')).toEqual(['SmartBlog AI']);
  });

  it('ignores case, accents and a leading #', () => {
    expect(titles('CAFE resume')).toEqual(['Café Résumé']);
    expect(titles('#reactjs')[0]).toBe('ReactJS');
  });

  it('a tab lists only its own kind', () => {
    expect(titles('react', 'stack')).toEqual(['React Native (familiar)', 'ReactJS']);
    expect(titles('react', 'tags')).toEqual(['#reactjs']);
    expect(titles('react', 'projects')).toEqual(['SmartBlog AI']);
    expect(titles('react', 'reels')).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(search(index, 'a', 'top', 2)).toHaveLength(2);
  });
});

describe('tagName', () => {
  it('makes a hashtag of a technology', () => {
    expect(['ReactJS', 'Node.js', 'AWS EC2', 'C#'].map(tagName)).toEqual([
      '#reactjs',
      '#nodejs',
      '#awsec2',
      '#c#',
    ]);
  });
});

describe('buildSearchIndex', () => {
  const content = {
    posts: [
      {
        id: 'blog',
        body: '',
        data: {
          title: 'SmartBlog AI',
          kind: 'project',
          resumeRef: 'projects/blog',
          org: 'Side project',
          media: [
            { type: 'text', headline: 'x' },
            { type: 'image', src: '/a.png', alt: 'A', tags: [{ label: 'Tailwind', x: 1, y: 1 }] },
          ],
        },
      },
      {
        id: 'chat',
        body: '',
        data: { title: 'Chat', kind: 'project', resumeRef: 'projects/chat', media: [] },
      },
      {
        id: 'certs',
        body: '',
        data: { title: 'Certifications', kind: 'certification', media: [] },
      },
    ],
    highlights: [
      { id: 'stack', data: { label: 'Stack', inRow: true } },
      { id: 'intro', data: { label: 'Intro', inRow: false } },
    ],
    reels: [{ id: 'blog-reel', data: { title: 'SmartBlog AI', description: 'A React app.' } }],
    resume: {
      projects: {
        blog: { stack: ['ReactJS', 'Tailwind'] },
        chat: { stack: ['ReactJS', 'FastAPI'] },
      },
      skills: { 'Front-End': ['ReactJS'] },
      certifications: [
        { name: 'AWS Cloud Practitioner Essentials' },
        { name: 'AI-900', issuer: 'Microsoft' },
      ],
    },
  } as unknown as SiteContent;
  const built = buildSearchIndex(content);
  const of = (tab?: string) =>
    built.filter((i) => i.tab === tab).map((i) => [i.title, i.kind, i.href]);

  it('posts, with projects on their tab and their stack as keywords', () => {
    expect(built[0]).toEqual({
      title: 'SmartBlog AI',
      kind: 'Project',
      href: '/p/blog/',
      keywords: 'Side project ReactJS Tailwind',
      tab: 'projects',
    });
    expect(of('projects').map(([t]) => t)).toEqual(['SmartBlog AI', 'Chat']);
  });

  it('highlights in the row, and reels with their own pages', () => {
    expect(built.filter((i) => i.kind === 'Highlight').map((i) => i.href)).toEqual([
      '/stories/stack/',
    ]);
    expect(of('reels')).toEqual([['SmartBlog AI', 'Reel', '/reels/blog-reel/']]);
  });

  it('skills on the Stack tab', () => {
    expect(of('stack')).toEqual([['ReactJS', 'Skill · Front-End', '/stories/stack/']]);
  });

  it('tags from project stacks and screenshot labels, most used first, each opening a search', () => {
    expect(of('tags')).toEqual([
      ['#reactjs', 'Tag · 2 posts', '/explore/?q=ReactJS'],
      ['#fastapi', 'Tag · 1 post', '/explore/?q=FastAPI'],
      ['#tailwind', 'Tag · 1 post', '/explore/?q=Tailwind'],
    ]);
  });

  it('every certification, opening her certifications post', () => {
    expect(
      built.filter((i) => i.kind.startsWith('Certification ') || i.kind === 'Certification'),
    ).toEqual([
      {
        title: 'AWS Cloud Practitioner Essentials',
        kind: 'Certification',
        href: '/p/certs/',
        keywords: '',
      },
      {
        title: 'AI-900',
        kind: 'Certification · Microsoft',
        href: '/p/certs/',
        keywords: 'Microsoft',
      },
    ]);
  });
});
