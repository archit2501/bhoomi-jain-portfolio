import { describe, expect, it } from 'vitest';
import { search, type SearchItem } from './search';

const item = (title: string, keywords = '', kind = 'Project'): SearchItem => ({
  title,
  kind,
  href: `/${title}/`,
  keywords,
});

const items = [
  item('SmartBlog AI', 'ReactJS Node.js MongoDB'),
  item('Conversational AI Web App', 'FastAPI AWS EC2'),
  item('React Native (familiar)', 'Front-End', 'Skill'),
  item('ReactJS', 'Front-End', 'Skill'),
  item('Café Résumé', ''),
];

describe('search', () => {
  it('finds nothing for an empty query', () => {
    expect(search(items, '   ')).toEqual([]);
  });

  it('ranks titles that start with the query, then titles that contain it, then keywords', () => {
    expect(search(items, 'react').map((i) => i.title)).toEqual([
      'React Native (familiar)',
      'ReactJS',
      'SmartBlog AI',
    ]);
  });

  it('needs every word of the query, in any order', () => {
    expect(search(items, 'ai app').map((i) => i.title)).toEqual(['Conversational AI Web App']);
    expect(search(items, 'mongodb blog').map((i) => i.title)).toEqual(['SmartBlog AI']);
  });

  it('ignores case and accents', () => {
    expect(search(items, 'CAFE resume').map((i) => i.title)).toEqual(['Café Résumé']);
  });

  it('stops at the limit', () => {
    expect(search(items, 'a', 2)).toHaveLength(2);
  });
});
