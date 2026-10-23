import { describe, expect, it } from 'vitest';
import { profileSchema } from './content-schema';
import { jsonLdScript, personJsonLd, robotsTxt, sitemapXml } from './seo';

const base = {
  username: 'bhoomi.jain',
  displayName: 'Bhoomi Jain',
  category: 'Full Stack Developer',
  bio: 'Bio',
  location: 'Delhi, India',
  avatar: { alt: 'Bhoomi Jain' },
  stats: ['a', 'b', 'c'],
  links: { linkedin: 'https://www.linkedin.com/in/example' },
};

describe('personJsonLd', () => {
  it('describes her with resume facts only', () => {
    const profile = profileSchema.parse({
      ...base,
      jobTitle: 'Full Stack Developer',
      organization: { name: 'Example Labs', url: 'https://example.org' },
      education: 'Amity University',
    });
    expect(personJsonLd(profile, 'https://example.com/')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Bhoomi Jain',
      url: 'https://example.com/',
      jobTitle: 'Full Stack Developer',
      worksFor: { '@type': 'Organization', name: 'Example Labs', url: 'https://example.org' },
      alumniOf: { '@type': 'CollegeOrUniversity', name: 'Amity University' },
      address: { '@type': 'PostalAddress', addressLocality: 'Delhi, India' },
      sameAs: ['https://www.linkedin.com/in/example'],
    });
  });

  it('lists her GitHub beside LinkedIn when she has one', () => {
    const withGithub = profileSchema.parse({
      ...base,
      links: { ...base.links, github: 'https://github.com/example' },
    });
    expect(personJsonLd(withGithub, 'https://example.com/').sameAs).toEqual([
      base.links.linkedin,
      'https://github.com/example',
    ]);
  });

  it('leaves out fields the profile does not have', () => {
    const data = personJsonLd(profileSchema.parse(base), 'https://example.com/');
    expect(data).not.toHaveProperty('jobTitle');
    expect(data).not.toHaveProperty('worksFor');
    expect(data).not.toHaveProperty('alumniOf');
  });
});

describe('jsonLdScript', () => {
  it('cannot close its own script tag', () => {
    expect(jsonLdScript({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});

describe('sitemapXml and robotsTxt', () => {
  it('lists every URL, escaped', () => {
    const xml = sitemapXml(['https://example.com/', 'https://example.com/p/a&b/']);
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<loc>https://example.com/p/a&amp;b/</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it('points crawlers at the sitemap', () => {
    expect(robotsTxt('https://example.com/sitemap.xml')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    );
  });

  it('turns every crawler away from a preview build, with no sitemap', () => {
    expect(robotsTxt('https://example.com/sitemap.xml', { preview: true })).toBe(
      'User-agent: *\nDisallow: /\n',
    );
  });
});
