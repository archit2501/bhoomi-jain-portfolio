/**
 * Share cards (task 6.3.5): the 1200×630 images LinkedIn, WhatsApp and Slack show for a link,
 * printed like the site: her fields, Plus Jakarta Sans and Geist Mono, the post's own cover.
 * Laid out with satori and rasterised with sharp at build time; nothing here ships to visitors.
 * Colours come from src/styles/tokens.css, so a card can't drift from the page it shares.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import type { Cover, Picto } from './covers';
import type { Field } from './fields';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

type Child = VNode | string | number | false | null | undefined;
interface VNode {
  type: string;
  props: { style?: Record<string, unknown>; children?: Child | Child[]; [key: string]: unknown };
}

/** A satori element: a tag, its style and children (no React needed). */
export function h(
  type: string,
  style: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): VNode {
  const kids = children.flat().filter((c) => c !== false && c !== null && c !== undefined);
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}

const img = (src: string, style: Record<string, unknown>): VNode => ({
  type: 'img',
  props: { src, style, width: style.width, height: style.height },
});

/** The light-theme token values from tokens.css (the first :root block). */
export function readTokens(css: string): Record<string, string> {
  const start = css.indexOf(':root {');
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

let fonts: Parameters<typeof satori>[1]['fonts'] | undefined;
let tokens: Record<string, string> | undefined;

function setup() {
  const root = process.cwd();
  tokens ??= readTokens(readFileSync(join(root, 'src/styles/tokens.css'), 'utf8'));
  const font = (pkg: string, file: string) =>
    readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file));
  fonts ??= [
    {
      name: 'Jakarta',
      weight: 500,
      style: 'normal',
      data: font('plus-jakarta-sans', 'plus-jakarta-sans-latin-500-normal.woff'),
    },
    {
      name: 'Jakarta',
      weight: 700,
      style: 'normal',
      data: font('plus-jakarta-sans', 'plus-jakarta-sans-latin-700-normal.woff'),
    },
    {
      name: 'Jakarta',
      weight: 800,
      style: 'normal',
      data: font('plus-jakarta-sans', 'plus-jakarta-sans-latin-800-normal.woff'),
    },
    {
      name: 'Mono',
      weight: 500,
      style: 'normal',
      data: font('geist-mono', 'geist-mono-latin-500-normal.woff'),
    },
  ];
  return { fonts, t: tokens };
}

/** What a card shows: the same parts as a post's cover, laid out for a wide image. */
export interface CardSpec {
  field: Field;
  head: readonly [string, string?];
  /** The big words: a title or a number. */
  big: string;
  label?: string;
  detail?: string;
  /** The right-hand art: a cover's pictogram or layers, a glyph, or her photo. */
  art?:
    | { kind: 'picto'; picto: Picto }
    | { kind: 'layers'; layers: string[] }
    | { kind: 'timeline'; from: string; to: string; progress: number }
    | { kind: 'glyph'; svg: string }
    | { kind: 'portrait'; src: string };
  /** A photo filling the left half (a photo post), as a data URI. */
  photo?: string;
  /** Her avatar for the footer, as a data URI. */
  avatar?: string;
  footer: string;
}

/** The big words' size: as large as fits a line or two, from the longest word. */
function bigSize(text: string, width: number): number {
  const longest = Math.max(...text.split(/\s+/).map((w) => w.length));
  return Math.round(Math.min(text.length <= 4 ? 230 : 128, (width * 1.75) / longest));
}

function pictoArt(picto: Picto, ink: string, accent: string, field: string): VNode {
  if (picto.type === 'dots') {
    const cols = Math.min(16, Math.ceil(Math.sqrt(picto.total * 1.6)));
    const rows = Math.ceil(picto.total / cols);
    const dot = 13;
    const gap = 8;
    return h(
      'div',
      { display: 'flex', flexWrap: 'wrap', width: cols * (dot + gap), gap },
      Array.from({ length: rows * cols }, (_, i) =>
        h('div', {
          width: dot,
          height: dot,
          borderRadius: dot,
          backgroundColor: i < picto.total ? (i === picto.lit - 1 ? accent : ink) : 'transparent',
          opacity: i === picto.lit - 1 ? 1 : 0.3,
          boxShadow: i === picto.lit - 1 ? `0 0 0 4px ${field}, 0 0 0 7px ${accent}` : 'none',
        }),
      ),
    );
  }
  if (picto.type === 'units') {
    const card = picto.shape === 'card';
    return h(
      'div',
      {
        display: 'flex',
        flexWrap: card ? 'nowrap' : 'wrap',
        gap: card ? 0 : 14,
        width: 340,
        alignItems: 'center',
      },
      Array.from({ length: picto.count }, (_, i) => {
        const tilt = (i - (picto.count - 1) / 2) * 7;
        return h('div', {
          flexShrink: 0,
          width: card ? 130 : 52,
          height: card ? 88 : 52,
          border: `5px solid ${ink}`,
          borderRadius: card ? 12 : 9,
          backgroundColor: card ? field : i % 2 ? 'transparent' : `${ink}22`,
          transform: card ? `rotate(${tilt}deg) translateY(${Math.abs(tilt) * 1.4}px)` : undefined,
          marginLeft: card && i ? -82 : 0,
        });
      }),
      picto.plus && h('div', { fontSize: 64, fontWeight: 800, lineHeight: 1 }, '+'),
    );
  }
  const base = picto.direction === 'up' ? 1 / (1 + picto.percent / 100) : 1 - picto.percent / 100;
  return h(
    'div',
    { display: 'flex', width: 360, height: 26 },
    h('div', {
      width: 360 * base,
      height: 26,
      backgroundColor: ink,
      borderRadius: '13px 0 0 13px',
    }),
    picto.direction === 'up'
      ? h('div', {
          flexGrow: 1,
          height: 26,
          borderRadius: '0 13px 13px 0',
          backgroundImage: 'linear-gradient(90deg, #a3e635, #34d399, #22d3ee, #38bdf8)',
        })
      : h('div', {
          flexGrow: 1,
          height: 26,
          border: `4px dashed ${ink}`,
          borderLeft: 'none',
          borderRadius: '0 13px 13px 0',
          opacity: 0.6,
        }),
  );
}

/** The card as a satori tree. */
export function cardTree(spec: CardSpec): VNode {
  const { t } = setup();
  const bg = t[`field-${spec.field}`];
  const fg = t[`field-${spec.field}-fg`];
  const meta = t[`field-${spec.field}-meta`];
  const ring = `linear-gradient(90deg, ${t['field-lime']}, ${t['field-emerald']}, ${t['field-cyan']}, ${t['field-sky']})`;
  const left = spec.photo ? 540 : 0;
  const textWidth = OG_WIDTH - left - 128 - (spec.art ? 400 : 0);
  const size = bigSize(spec.big, textWidth);
  const accent = spec.field === 'ink' || spec.field === 'deep' ? t['field-lime'] : fg;

  let art: VNode | undefined;
  if (spec.art?.kind === 'picto') art = pictoArt(spec.art.picto, fg, accent, bg);
  if (spec.art?.kind === 'layers') {
    art = h(
      'div',
      { display: 'flex', flexDirection: 'column', gap: 28, position: 'relative' },
      h('div', {
        position: 'absolute',
        left: 9,
        top: 16,
        bottom: 16,
        width: 6,
        borderRadius: 3,
        backgroundImage: ring.replace('90deg', '180deg'),
      }),
      spec.art.layers.map((layer) =>
        h(
          'div',
          { display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'Mono', fontSize: 25 },
          h('div', {
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: 24,
            border: `5px solid ${fg}`,
            backgroundColor: bg,
          }),
          h('div', { display: 'flex', width: 300 }, layer),
        ),
      ),
    );
  }
  if (spec.art?.kind === 'glyph') {
    art = img(
      `data:image/svg+xml;base64,${Buffer.from(spec.art.svg.replaceAll('currentColor', fg)).toString('base64')}`,
      { width: 260, height: 260 },
    );
  }
  if (spec.art?.kind === 'portrait') {
    art = h(
      'div',
      { display: 'flex', padding: 10, borderRadius: 300, backgroundImage: ring },
      h(
        'div',
        { display: 'flex', padding: 8, borderRadius: 300, backgroundColor: bg },
        img(spec.art.src, { width: 300, height: 300, borderRadius: 300 }),
      ),
    );
  }

  const timeline =
    spec.art?.kind === 'timeline'
      ? h(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            marginTop: 30,
            width: textWidth + 400,
          },
          h(
            'div',
            { display: 'flex', height: 12, borderRadius: 6, backgroundColor: `${fg}40` },
            h('div', {
              width: `${Math.round(spec.art.progress * 100)}%`,
              height: 12,
              borderRadius: 6,
              backgroundImage: ring,
            }),
          ),
          h(
            'div',
            {
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'Mono',
              fontSize: 24,
              color: meta,
            },
            h('div', {}, spec.art.from),
            h('div', {}, spec.art.to),
          ),
        )
      : undefined;

  return h(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      display: 'flex',
      backgroundColor: bg,
      color: fg,
      fontFamily: 'Jakarta',
    },
    spec.photo && img(spec.photo, { width: left, height: OG_HEIGHT, objectFit: 'cover' }),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '56px 64px 48px' },
      h(
        'div',
        {
          display: 'flex',
          justifyContent: 'space-between',
          paddingBottom: 14,
          borderBottom: `3px solid ${meta}`,
          color: meta,
          fontFamily: 'Mono',
          fontSize: 24,
          letterSpacing: 1,
          textTransform: 'uppercase',
        },
        h('div', {}, spec.head[0]),
        spec.head[1] && h('div', {}, spec.head[1]),
      ),
      h(
        'div',
        {
          display: 'flex',
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 40,
        },
        h(
          'div',
          {
            display: 'flex',
            flexDirection: 'column',
            width: spec.art && spec.art.kind !== 'timeline' ? textWidth : undefined,
            flexGrow: 1,
          },
          h(
            'div',
            {
              display: 'flex',
              fontSize: size,
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: -size * 0.045,
            },
            spec.big,
          ),
          spec.label &&
            h(
              'div',
              {
                display: 'flex',
                marginTop: 22,
                fontSize: 40,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: -0.5,
              },
              spec.label,
            ),
          spec.detail &&
            h(
              'div',
              {
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: 12,
                marginTop: 14,
                fontFamily: 'Mono',
                fontSize: 24,
                color: meta,
              },
              // A "·" list breaks between terms, never inside one ("React Query" stays whole).
              spec.detail
                .split(' · ')
                .map((term, i) =>
                  h('div', { display: 'flex', whiteSpace: 'nowrap' }, i ? `· ${term}` : term),
                ),
            ),
          timeline,
        ),
        art &&
          spec.art?.kind !== 'timeline' &&
          h('div', { display: 'flex', width: 360, justifyContent: 'center' }, art),
      ),
      h(
        'div',
        { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        h(
          'div',
          { display: 'flex', alignItems: 'center', gap: 16 },
          spec.avatar && img(spec.avatar, { width: 56, height: 56, borderRadius: 56 }),
          h('div', { display: 'flex', fontSize: 26, fontWeight: 700 }, 'bhoomi.jain'),
          h(
            'div',
            {
              display: 'flex',
              fontFamily: 'Mono',
              fontSize: 22,
              color: meta,
              whiteSpace: 'nowrap',
            },
            spec.footer,
          ),
        ),
        !spec.photo && h('div', { width: 200, height: 10, borderRadius: 5, backgroundImage: ring }),
      ),
    ),
  );
}

/** The card as a PNG. */
export async function renderCard(spec: CardSpec): Promise<Uint8Array<ArrayBuffer>> {
  const { fonts: loaded } = setup();
  const svg = await satori(cardTree(spec) as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: loaded,
  });
  // Flat fields compress well as they are; a card with a photo uses a 256-colour palette,
  // which keeps it a fraction of the size with no visible loss at card size.
  const png =
    spec.photo || spec.art?.kind === 'portrait'
      ? sharp(Buffer.from(svg)).png({ palette: true, colours: 256, quality: 90, dither: 0.6 })
      : sharp(Buffer.from(svg)).png({ compressionLevel: 9 });
  return new Uint8Array(await png.toBuffer());
}

/** A photo under src/assets/media/ as a data URI, cropped to the box. */
export async function photoUri(src: string, width: number, height: number): Promise<string> {
  const file = join(process.cwd(), 'src/assets/media', src);
  const jpeg = await sharp(file)
    .resize(width, height, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/** A post's card from its cover (src/lib/covers.ts). */
export function postSpec(
  cover: Cover,
  field: Field,
  extra: {
    head: readonly [string, string?];
    footer: string;
    avatar?: string;
    photo?: string;
    headline: string;
    detail?: string;
  },
): CardSpec {
  const base = { field, footer: extra.footer, avatar: extra.avatar };
  switch (cover.layout) {
    case 'project':
      return {
        ...base,
        head: cover.head,
        big: cover.title,
        label: cover.deck,
        art: cover.layers.length ? { kind: 'layers', layers: cover.layers } : undefined,
        detail: cover.stack.join(' · '),
      };
    case 'stat':
      return {
        ...base,
        head: cover.head,
        big: cover.hero,
        label: cover.label,
        detail: cover.detail ?? cover.who,
        art: cover.picto ? { kind: 'picto', picto: cover.picto } : undefined,
      };
    case 'title':
      return {
        ...base,
        head: cover.head,
        big: cover.title,
        label: cover.label,
        art: cover.timeline
          ? {
              kind: 'timeline',
              from: cover.timeline.from,
              to: cover.timeline.to + (cover.timeline.note ? ` (${cover.timeline.note})` : ''),
              progress: cover.timeline.progress,
            }
          : undefined,
      };
    case 'photo':
      return {
        ...base,
        field: 'paper',
        head: extra.head,
        big: extra.headline,
        label: extra.detail,
        photo: extra.photo,
      };
  }
}

/** The Phosphor glyphs a card can show (Regular weight), by the names Icon.astro uses. */
const GLYPHS: Partial<Record<string, string>> = {
  architecture: 'tree-structure',
  work: 'briefcase',
  stack: 'stack',
  certificate: 'certificate',
  trophy: 'trophy',
  wave: 'hand-waving',
  play: 'play',
};

/** A glyph's SVG, or undefined when cards don't carry it. */
export function glyphSvg(name: string): string | undefined {
  const file = GLYPHS[name];
  if (!file) return undefined;
  return readFileSync(
    join(process.cwd(), 'node_modules/@phosphor-icons/core/assets/regular', `${file}.svg`),
    'utf8',
  );
}

/** The first sentence of a text, cut to about `chars` characters at a word, with "…". */
export function shortText(text: string, chars: number): string {
  const sentence = text.split(/(?<=[.:])\s/)[0].replace(/[.:]$/, '');
  if (sentence.length <= chars) return sentence;
  return `${sentence.slice(0, sentence.lastIndexOf(' ', chars)).replace(/[\s,;·–-]+$/, '')}…`;
}

/** A PNG card as the route's response. */
export const cardResponse = (png: Uint8Array) =>
  new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
