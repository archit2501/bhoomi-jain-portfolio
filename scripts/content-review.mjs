/**
 * Bhoomi's sign-off sheet (task 5.2.1): every word and number the site shows about her, from the
 * content files, each with a box to tick. Regenerate after any content change:
 *
 *   node scripts/content-review.mjs > docs/content-review.md
 *
 * Her phone number is never in the content, so it can't be in the sheet.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const CONTENT = 'src/content';
const json = (file) => JSON.parse(readFileSync(join(CONTENT, file), 'utf8'));
const box = (text) => `- [ ] ${text.replace(/\s*\n\s*/g, ' ').trim()}`;
const out = [];
const say = (...lines) => out.push(...lines);

const profile = Object.values(json('profile.json'))[0];
const figures = json('figures.json');
const posts = readdirSync(join(CONTENT, 'posts'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const [, front, body] = readFileSync(join(CONTENT, 'posts', f), 'utf8').split(/^---$/m);
    return { id: f.replace(/\.md$/, ''), data: parse(front), body: body.trim() };
  })
  .sort((a, b) => a.data.order - b.data.order);
const highlights = readdirSync(join(CONTENT, 'highlights'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ id: f.replace(/\.json$/, ''), data: json(join('highlights', f)) }))
  .sort((a, b) => a.data.order - b.data.order);
const reels = Object.entries(json('reels.json')).sort(([, a], [, b]) => a.order - b.order);
const threads = Object.entries(json('dm-threads.json')).sort(([, a], [, b]) => a.order - b.order);
const events = Object.entries(json('events.json'));

say(
  '# Content sign-off',
  '',
  `Everything the site says about ${profile.displayName}, for her to check before launch. Tick a`,
  'box when it reads right; note any change beside it. Generated from `src/content` by',
  '`scripts/content-review.mjs`, so it always matches the site.',
  '',
  '## Profile',
  '',
  box(`Name: ${profile.displayName}`),
  box(`Username: ${profile.username}`),
  box(`Category: ${profile.category}`),
  box(`Bio: ${profile.bio.split('\n').join(' / ')}`),
  box(`Location: ${profile.location}`),
  ...Object.entries(profile.links).map(([k, v]) => box(`Link (${k}): ${v}`)),
  '',
  '## Figures',
  '',
  'Each number, and the line of her résumé it comes from.',
  '',
  ...Object.entries(figures).map(([id, f]) =>
    box(
      `**${f.value ?? `(counted: ${f.count})`} ${f.label}** — ${f.source}${f.verified ? '' : ' _(not yet confirmed)_'} \`${id}\``,
    ),
  ),
  '',
  '## Posts',
  '',
);
for (const { id, data, body } of posts) {
  say(`### ${data.title} (\`/p/${id}/\`)`, '');
  say(
    box(
      `Title and line: ${data.title}${data.org ? ` · ${data.org}` : ''}${data.dateLabel ? ` · ${data.dateLabel}` : ''}`,
    ),
  );
  say(box(`Caption: ${body}`));
  if (data.tldr) say(box(`Pinned summary: ${data.tldr}`));
  for (const [i, m] of data.media.entries()) {
    if (m.type === 'text')
      say(box(`Slide ${i + 1}: ${m.headline}${m.detail ? ` — ${m.detail}` : ''}`));
    else if (m.type === 'diagram') say(box(`Slide ${i + 1} (diagram): ${m.title}`));
    else if (m.type === 'code')
      say(box(`Slide ${i + 1} (code): ${m.title ?? m.language ?? 'code'}`));
    else if (m.type === 'image') say(box(`Slide ${i + 1} (photo): ${m.alt}`));
  }
  say('');
}
say('## Stories', '');
for (const { id, data } of highlights) {
  say(`### ${data.label} (\`/stories/${id}/\`)`, '');
  for (const [i, f] of data.frames.entries()) {
    const words =
      f.type === 'text'
        ? [f.heading, f.body].filter(Boolean).join(': ')
        : `(photo) ${f.alt}${f.caption ? ` — ${f.caption}` : ''}`;
    say(box(`Story ${i + 1}: ${words}`));
    for (const s of f.stickers ?? []) {
      if (s.type === 'poll')
        say(box(`  Poll: ${s.question} — ${s.options.join(' / ')} _(new wording)_`));
      else if (s.type === 'question') say(box(`  Question box: ${s.prompt} _(new wording)_`));
      else if (s.type === 'slider')
        say(box(`  Slider: ${s.prompt} ${s.emoji ?? ''} _(new wording)_`));
      else if (s.type === 'link') say(box(`  Link sticker: ${s.label ?? s.href}`));
      else if (s.type === 'mention') say(box(`  Mention: @${s.name}`));
      else if (s.type === 'location') say(box(`  Location: ${s.name}`));
    }
  }
  say('');
}
say('## Reels', '');
for (const [id, r] of reels) say(box(`**${r.title}** (\`/reels/${id}/\`): ${r.description ?? ''}`));
say('', '## Messages: her opening lines', '');
for (const [id, t] of threads) {
  say(box(`**${t.label}** (\`/direct/${id}/\`): ${t.opener}`));
  for (const q of t.suggestions ?? []) say(box(`  Suggested question: ${q} _(new wording)_`));
}
say('', '## Career milestones (Notifications)', '');
for (const [, e] of events) say(box(`${e.date}: ${e.title}${e.org ? ` · ${e.org}` : ''}`));
say('');
process.stdout.write(out.join('\n'));
