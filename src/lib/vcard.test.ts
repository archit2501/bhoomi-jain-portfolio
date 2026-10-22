import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Profile, Resume } from './content-schema';
import { vcard, vcardEscape } from './vcard';

const profile = JSON.parse(readFileSync('src/content/profile.json', 'utf8')).bhoomi as Profile;
const resume = JSON.parse(readFileSync('src/content/resume.json', 'utf8')).bhoomi as Resume;

describe('vcard', () => {
  const card = vcard(profile, resume, 'https://bhoomi.example/');

  it('her name, title, email, place, LinkedIn and site, as vCard 3.0 with CRLF lines', () => {
    const lines = card.split('\r\n');
    expect(lines.slice(0, 7)).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Jain;Bhoomi;;;',
      'FN:Bhoomi Jain',
      'TITLE:Full Stack Developer',
      `EMAIL;TYPE=INTERNET:${profile.links.email}`,
      'ADR;TYPE=HOME:;;;Delhi;;;India',
    ]);
    expect(lines).toContain('URL:https://bhoomi.example/');
    expect(lines).toContain(`X-SOCIALPROFILE;TYPE=linkedin:${profile.links.linkedin}`);
    expect(lines.at(-2)).toBe('END:VCARD');
    expect(card.endsWith('\r\n')).toBe(true);
  });

  it('never carries a phone number', () => {
    expect(card).not.toMatch(/^TEL/m);
    expect(card).not.toMatch(/\+?\d[\d\s-]{9,}\d/);
  });

  it('escapes what vCard treats as structure', () => {
    // In the card: a\,b\;c\\d\ne
    expect(vcardEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(vcardEscape('a;b')).toHaveLength(4);
  });
});
