/**
 * Her contact card (task 5.1.1): a vCard 3.0 a visitor can save from the share sheet. It holds
 * only what the site already shows: her name, title, email, location, LinkedIn and this site.
 * Never a phone number.
 */
import type { Profile, Resume } from './content-schema';

/** RFC 6350 text escaping: backslash, comma, semicolon and newlines. */
export function vcardEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}

export function vcard(profile: Profile, resume: Pick<Resume, 'location'>, site: string): string {
  const parts = profile.displayName.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : '';
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
  const [city, ...rest] = resume.location.split(',').map((s) => s.trim());
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vcardEscape(family)};${vcardEscape(given)};;;`,
    `FN:${vcardEscape(profile.displayName)}`,
    `TITLE:${vcardEscape(profile.category)}`,
    ...(profile.links.email ? [`EMAIL;TYPE=INTERNET:${profile.links.email}`] : []),
    `ADR;TYPE=HOME:;;;${vcardEscape(city)};;;${vcardEscape(rest.join(', '))}`,
    `URL:${site}`,
    `X-SOCIALPROFILE;TYPE=linkedin:${profile.links.linkedin}`,
    ...(profile.links.github ? [`X-SOCIALPROFILE;TYPE=github:${profile.links.github}`] : []),
    'END:VCARD',
  ];
  // vCard lines end in CRLF.
  return `${lines.join('\r\n')}\r\n`;
}
