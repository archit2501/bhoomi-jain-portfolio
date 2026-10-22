import type { Profile } from './content-schema';

/** schema.org Person for search engines, built only from profile fields (all from her resume). */
export function personJsonLd(profile: Profile, siteUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.displayName,
    url: siteUrl,
    ...(profile.jobTitle && { jobTitle: profile.jobTitle }),
    ...(profile.organization && {
      worksFor: { '@type': 'Organization', ...profile.organization },
    }),
    ...(profile.education && {
      alumniOf: { '@type': 'CollegeOrUniversity', name: profile.education },
    }),
    address: { '@type': 'PostalAddress', addressLocality: profile.location },
    sameAs: [profile.links.linkedin, profile.links.github].filter((url): url is string =>
      Boolean(url),
    ),
  };
}

/** JSON for a <script type="application/ld+json">, safe against a closing </script> in the data. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function sitemapXml(urls: readonly string[]): string {
  const entries = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function robotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
