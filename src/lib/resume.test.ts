import { describe, expect, it } from 'vitest';
import { postSchema, resumeSchema, type Post } from './content-schema';
import { checkResume, findPhoneNumbers, resolveFigures, resumeCounts } from './resume';

const resume = resumeSchema.parse({
  source: 'test',
  name: 'Test Person',
  location: 'Delhi, India',
  email: 'test@example.com',
  linkedin: 'https://www.linkedin.com/in/example',
  experience: {
    acme: {
      org: 'Acme',
      role: 'Developer (Intern)',
      start: '2023-07',
      end: '2023-09',
      bullets: ['x'],
    },
  },
  projects: {
    app: { name: 'App', years: '2024', stack: ['React'], bullets: ['x'] },
    tool: { name: 'Tool', subtitle: 'Web UI', years: '2024', stack: ['Flask'], bullets: ['x'] },
  },
  skills: { 'Front-End': ['React'] },
  education: {
    bca: { degree: 'BCA', school: 'Uni', start: '2022-09', end: '2025-04' },
  },
  achievements: { win: { title: 'Winner — Cup', detail: '1st of 10' } },
  certifications: [{ name: 'Cert One' }, { name: 'Cert Two', issuer: 'Org' }],
});

const post = (id: string, data: Partial<Post> & Pick<Post, 'kind'>, body = 'Caption') => ({
  id,
  body,
  data: postSchema.parse({ title: id, order: 1, media: [{ type: 'text', headline: id }], ...data }),
});

const complete = () => [
  post('app', { kind: 'project', resumeRef: 'projects/app', title: 'App' }),
  post('tool', { kind: 'project', resumeRef: 'projects/tool', title: 'Tool' }),
  post('acme', { kind: 'experience', resumeRef: 'experience/acme', title: 'Developer (Intern)' }),
  post('bca', { kind: 'education', resumeRef: 'education/bca', title: 'BCA' }),
  post('win', { kind: 'achievement', resumeRef: 'achievements/win', title: 'Winner — Cup' }),
  post('certs', { kind: 'certification', resumeRef: 'certifications' }, 'Cert One and Cert Two'),
];

describe('resumeCounts and resolveFigures', () => {
  it('counts each list', () => {
    expect(resumeCounts(resume)).toEqual({
      projects: 2,
      experience: 1,
      education: 1,
      certifications: 2,
    });
  });

  it('fills counted figures from the résumé and keeps stated values', () => {
    const figures = resolveFigures(
      {
        projects: { count: 'projects', label: 'projects', source: 's', verified: true },
        win: { value: '1st', label: 'of 10', source: 's', verified: true },
      },
      resume,
    );
    expect(figures.projects).toEqual({
      count: 'projects',
      value: '2',
      label: 'projects',
      source: 's',
      verified: true,
    });
    expect(figures.win).toEqual({ value: '1st', label: 'of 10', source: 's', verified: true });
  });
});

describe('findPhoneNumbers', () => {
  it('finds numbers written the usual ways', () => {
    for (const phone of ['+91 98765 43210', '9876543210', '(987) 654-3210', '+1 987.654.3210']) {
      expect(findPhoneNumbers(`call ${phone} today`)).toEqual([phone]);
    }
  });

  it('ignores years, ranges, sizes and figures', () => {
    const text =
      '2022 – 2025, Jul 2023 – Sep 2023, 320px–1440px, 1st of 160, 500+, 3 hrs/week, 12+';
    expect(findPhoneNumbers(text)).toEqual([]);
  });
});

describe('checkResume', () => {
  it('passes when every entry has one post with the résumé wording', () => {
    expect(checkResume(resume, complete())).toEqual([]);
  });

  it('rejects a title that differs from the résumé', () => {
    const posts = complete();
    posts[2] = post('acme', {
      kind: 'experience',
      resumeRef: 'experience/acme',
      title: 'AI Developer (Intern)',
    });
    expect(checkResume(resume, posts)).toEqual([
      'post acme: title "AI Developer (Intern)" differs from the résumé\'s "Developer (Intern)"',
    ]);
  });

  it('rejects projects that are not on the résumé, and wrong lists', () => {
    const posts = [
      ...complete(),
      post('ghost', { kind: 'project', resumeRef: 'projects/ghost', title: 'Ghost' }),
      post('mixed', { kind: 'education', resumeRef: 'projects/zzz', title: 'App' }),
    ];
    expect(checkResume(resume, posts)).toEqual([
      'post ghost: "projects/ghost" isn\'t on the résumé',
      'post mixed: a education post points at "education/…", not "projects/zzz"',
    ]);
  });

  it('reports résumé entries with no post, and posts shown twice', () => {
    const posts = complete().filter((p) => p.id !== 'bca');
    posts.push(post('app-again', { kind: 'project', resumeRef: 'projects/app', title: 'App' }));
    expect(checkResume(resume, posts)).toEqual([
      'post app-again: "projects/app" is already shown by post app',
      'résumé "education/bca" has no post',
    ]);
  });

  it('needs a résumé reference on every kind but log, and none on a log', () => {
    const posts = [
      ...complete(),
      post('loose', { kind: 'project', title: 'Loose' }),
      post('diary', { kind: 'log', resumeRef: 'projects/app' }),
      post('fine', { kind: 'log' }),
    ];
    expect(checkResume(resume, posts)).toEqual([
      'post loose: a project post needs a resumeRef',
      "post diary: a log post can't point at the résumé",
    ]);
  });

  it('makes the certifications post name every certification', () => {
    const posts = complete().filter((p) => p.id !== 'certs');
    posts.push(post('certs', { kind: 'certification', resumeRef: 'certs' }, 'Cert One only'));
    expect(checkResume(resume, posts)).toEqual([
      'post certs: a certification post points at "certifications"',
      'post certs: the caption doesn\'t name "Cert Two"',
      'résumé "certifications" has no post',
    ]);
  });
});
