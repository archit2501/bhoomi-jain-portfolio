import { describe, expect, it } from 'vitest';
import {
  allowedEdits,
  match,
  normalise,
  prefixDistance,
  queryWords,
  wordScore,
  fieldOf,
  type Searchable,
} from './match';

const item = (title: string, keywords = ''): Searchable => ({
  title: fieldOf(title),
  keywords: fieldOf(keywords),
});

describe('words', () => {
  it('lower case without accents, split on punctuation, and run together', () => {
    expect(normalise('Résumé')).toBe('resume');
    expect(fieldOf('Node.js')).toEqual({ words: ['node', 'js'], joined: 'nodejs' });
    expect(fieldOf('SmartBlog AI')).toEqual({ words: ['smartblog', 'ai'], joined: 'smartblogai' });
    expect(fieldOf('C++ and C#')).toEqual({ words: ['c++', 'and', 'c#'], joined: 'c++andc#' });
    expect(fieldOf('React')).toEqual({ words: ['react'] });
    expect(queryWords('#React  js')).toEqual(['react', 'js']);
  });

  it('allows no typo in short words, one in middling ones, two in long ones', () => {
    expect([2, 3, 4, 5, 6, 12].map(allowedEdits)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('prefixDistance', () => {
  it('measures a query against the start of a word', () => {
    expect(prefixDistance('reakt', 'react', 1)).toBe(1);
    expect(prefixDistance('reac', 'reactjs', 1)).toBe(0);
    expect(prefixDistance('mongdb', 'mongodb', 2)).toBe(1);
    expect(prefixDistance('fastpai', 'fastapi', 2)).toBe(1); // two letters swapped
    expect(prefixDistance('tpyescript', 'typescript', 2)).toBe(1);
  });

  it('gives up past the limit', () => {
    expect(prefixDistance('kotlin', 'react', 2)).toBe(Infinity);
    expect(prefixDistance('rect', 'docker', 1)).toBe(Infinity);
  });
});

describe('wordScore', () => {
  it('ranks the same word, its start, inside it, then near misses', () => {
    expect(wordScore('react', 'react')).toBe(0);
    expect(wordScore('rea', 'react')).toBe(1);
    expect(wordScore('blog', 'smartblog')).toBe(2);
    expect(wordScore('reakt', 'react')).toBe(4);
    expect(wordScore('aws', 'azure')).toBe(Infinity);
    // Two letters inside a word are too loose to count.
    expect(wordScore('js', 'jsx')).toBe(1);
    expect(wordScore('ct', 'react')).toBe(Infinity);
  });

  it('forgives a typo only with the right first letter, within what the shorter word allows', () => {
    expect(wordScore('fastapi', 'restapis')).toBe(Infinity);
    expect(wordScore('reactjs', 'react')).toBe(Infinity);
    expect(wordScore('convrsational', 'conversational')).toBe(4);
    expect(wordScore('reakt', 'react', false)).toBe(Infinity);
  });
});

describe('match', () => {
  it("finds React for 'reakt'", () => {
    expect(match(['reakt'], item('ReactJS', 'Front-End'))).toEqual({ score: 4, inTitle: true });
  });

  it('needs every query word, from the title or the keywords', () => {
    const blog = item('SmartBlog AI', 'ReactJS Node.js MongoDB');
    expect(match(['blog', 'mongo'], blog)).toEqual({ score: 2 + 1 + 2, inTitle: false });
    expect(match(['blog', 'kotlin'], blog)).toBeNull();
    expect(match([], blog)).toBeNull();
  });

  it('the run-together form matches whole, never with a typo', () => {
    expect(match(['nodejs'], item('Node.js'))?.score).toBe(0);
    expect(match(['reactjs'], item('React Native (familiar)'))).toBeNull();
  });

  it('ignores accents in the query too', () => {
    expect(match(queryWords('resume'), item('Résumé'))?.score).toBe(0);
  });
});

describe('speed', () => {
  // 200 items of about ten words each: the size limit in the plan.
  const vocabulary =
    'react node mongodb express fastapi aws docker figma jest typescript tailwind bootstrap flask azure lighthouse hotjar analytics dashboard component testing'.split(
      ' ',
    );
  const items = Array.from({ length: 200 }, (_, i) =>
    item(
      `Project ${i} ${vocabulary[i % vocabulary.length]} platform`,
      Array.from({ length: 8 }, (_, k) => vocabulary[(i * 7 + k * 3) % vocabulary.length]).join(
        ' ',
      ),
    ),
  );

  it('answers each keystroke in under 5 ms at n = 200', () => {
    const typed = 'conversational typescrpit dashbord';
    const scan = (query: string[]) => {
      for (const entry of items) match(query, entry);
    };
    // Warm up, then time each keystroke as the best of seven scans: the matcher's own cost,
    // without whatever else the machine is doing (other test files run alongside).
    for (let end = 1; end <= typed.length; end++) scan(queryWords(typed.slice(0, end)));
    const times: number[] = [];
    for (let end = 1; end <= typed.length; end++) {
      const query = queryWords(typed.slice(0, end));
      let best = Infinity;
      for (let run = 0; run < 7; run++) {
        const start = performance.now();
        scan(query);
        best = Math.min(best, performance.now() - start);
      }
      times.push(best);
    }
    expect(Math.max(...times)).toBeLessThan(5);
  });
});
