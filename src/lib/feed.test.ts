import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Post, Resume } from './content-schema';
import { feedOrder, lensesOf, skillTerms } from './feed';

const resume = JSON.parse(readFileSync('src/content/resume.json', 'utf8')).bhoomi as Resume;
const post = (data: Partial<Post>, body = '') => ({
  id: 'x',
  body,
  data: { title: 'Untitled', order: 1, ...data } as Post,
});

describe('skillTerms', () => {
  it('names a skill the ways her posts write it', () => {
    expect(skillTerms('Tailwind CSS')).toEqual(['Tailwind CSS', 'Tailwind']);
    expect(skillTerms('ReactJS')).toEqual(['ReactJS', 'React']);
    expect(skillTerms('Node.js')).toEqual(['Node.js', 'Node']);
    expect(skillTerms('JavaScript (ES6+)')).toEqual(['JavaScript']);
    expect(skillTerms('SASS/LESS')).toEqual(['SASS', 'LESS']);
    expect(skillTerms('JWT Authentication')).toEqual(['JWT Authentication', 'JWT']);
  });
});

describe('lensesOf, from her real résumé', () => {
  it('a full-stack AI project is Frontend, Backend and AI', () => {
    expect(
      lensesOf(post({ title: 'SmartBlog AI', resumeRef: 'projects/smartblog-ai' }), resume),
    ).toEqual(['frontend', 'backend', 'ai']);
  });

  it('her front-end internship is Frontend only, from the role and the bullets', () => {
    expect(
      lensesOf(post({ title: 'TheMobiAdz', resumeRef: 'experience/themobiadz' }), resume),
    ).toEqual(['frontend']);
  });

  it('the certifications are AI (Azure AI Fundamentals, Elements of AI)', () => {
    expect(
      lensesOf(post({ title: 'Certifications', resumeRef: 'certifications' }), resume),
    ).toEqual(['ai']);
  });

  it('a degree with no stack in its words is under All only', () => {
    expect(lensesOf(post({ title: 'BCA', resumeRef: 'education/amity-bca' }), resume)).toEqual([]);
  });

  it('matches whole names as written: "rest of" is not REST, "AIM" is not AI', () => {
    expect(lensesOf(post({ title: 'Notes' }, 'The rest of the AIM team.'), resume)).toEqual([]);
    expect(lensesOf(post({ title: 'Notes' }, 'A REST API on Node.js.'), resume)).toEqual([
      'backend',
    ]);
  });
});

describe('feedOrder', () => {
  it('newest first; undated last; ties keep order', () => {
    const posts = [
      { id: 'a', data: { date: '2024', order: 2 } },
      { id: 'b', data: { order: 1 } },
      { id: 'c', data: { date: '2025-07', order: 3 } },
      { id: 'd', data: { date: '2024', order: 1 } },
    ];
    expect(feedOrder(posts).map((p) => p.id)).toEqual(['c', 'd', 'a', 'b']);
  });
});
