/**
 * Open Graph images (1200×630 PNG), rendered at build time: satori lays out the card as SVG,
 * sharp rasterises it to PNG. Used by src/pages/og/*.png.ts.
 *
 * Font notes (satori 0.63):
 * - Variable fonts only render their default instance → we load static Be Vietnam Pro weights.
 * - @fontsource files are unicode-range SUBSETS. Each subset is registered under its own family
 *   name and the card's fontFamily lists all of them, so satori falls back per glyph
 *   (otherwise "ữ ự Đ" render blank).
 * - Text is NFC-normalised so Vietnamese letters hit the precomposed glyphs in the "vietnamese" subset.
 *
 * The pure helpers (normalizeText, wrapLines, fitTitle, hexToRgba…) are unit-tested in tests/unit/og.test.ts.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/* ------------------------------------------------------------------ */
/* Palette — mirrors the dark-theme tokens in src/styles/global.css     */
/* (satori cannot read CSS variables, so the hex values live here).      */
/* ------------------------------------------------------------------ */
export const OG_COLORS = {
  ink: '#0c0d11', // --bg (dark)
  fg: '#ececf0', // --fg (dark)
  muted: '#a8a8b3', // --fg-muted (dark)
  brandFrom: '#6d5dfc', // logo gradient
  brandTo: '#f0562e',
  category: {
    ai: '#a78bfa', // --cat-ai (dark)
    'cong-nghe': '#38bdf8', // --cat-tech (dark)
    'doi-song': '#34d399', // --cat-life (dark)
  } as Record<string, string>,
} as const;

/* ------------------------------------------------------------------ */
/* Pure helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * NFC + collapse whitespace + typographic quotes ("bịa" → “bịa”).
 * Satori needs precomposed Vietnamese letters (ữ, not u + ̃ + ̛).
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"([^"]*)"/g, '“$1”');
}

/** "#a78bfa" (or "#abc") → "rgba(167, 139, 250, 0.2)". */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Invalid hex colour "${hex}"`);
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const NARROW = new Set([...`iljI.,:;'!|’‘`]);
const SEMI = new Set([...`frt()[]{}-/"“”*`]);
const WIDE_LOWER = new Set(['m', 'w']);
const WIDE_UPPER = new Set(['M', 'W']);

/**
 * Approximate advance width of one character, in em, for Be Vietnam Pro ExtraBold.
 * Deliberately a little generous: overestimating only costs a smaller font size,
 * underestimating would let satori wrap onto a 4th line.
 */
export function charWidthEm(ch: string): number {
  if (ch === ' ') return 0.27;
  if (ch === '…' || ch === '—') return 0.92;
  if (ch === '–') return 0.58;
  if (ch === '&') return 0.78;
  if (ch === '?') return 0.56;
  // Base letter without diacritics (ữ → u, Đ → D): accents do not change the advance width.
  const base = ch.normalize('NFD').charAt(0).replace('đ', 'd').replace('Đ', 'D');
  if (NARROW.has(base)) return 0.32;
  if (SEMI.has(base)) return 0.44;
  if (WIDE_LOWER.has(base)) return 0.92;
  if (WIDE_UPPER.has(base)) return 1.02;
  if (/[0-9]/.test(base)) return 0.64;
  if (/[A-Z]/.test(base)) return 0.74;
  if (/[a-z]/.test(base)) return 0.62;
  return 0.8; // anything else (symbols, CJK…) — assume wide
}

/** Estimated rendered width in px of `text` at `fontSize` with `letterSpacing` (px per glyph). */
export function estimateTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let em = 0;
  let glyphs = 0;
  for (const ch of normalizeText(text)) {
    em += charWidthEm(ch);
    glyphs++;
  }
  return em * fontSize + glyphs * letterSpacing;
}

/** Greedy word wrap using the width estimate. A single over-long word gets a line of its own. */
export function wrapLines(text: string, fontSize: number, maxWidth: number, letterSpacing = 0): string[] {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || estimateTextWidth(candidate, fontSize, letterSpacing) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface FitTitleOptions {
  /** Width of the title box in px. */
  maxWidth: number;
  maxLines?: number;
  /** Candidate font sizes, largest first. */
  sizes?: number[];
  /** Letter spacing as a fraction of the font size (negative = tighter). */
  tracking?: number;
}

export interface FittedTitle {
  fontSize: number;
  letterSpacing: number;
  lines: string[];
  text: string;
  truncated: boolean;
}

export const TITLE_SIZES = [76, 68, 60, 54, 48];

/**
 * Pick the largest font size at which the title fits in `maxLines`; if even the smallest size
 * overflows, cut at a word boundary and end the last line with "…".
 */
export function fitTitle(title: string, opts: FitTitleOptions): FittedTitle {
  const { maxWidth, maxLines = 3, sizes = TITLE_SIZES, tracking = -0.015 } = opts;
  const clean = normalizeText(title);
  const ordered = [...sizes].sort((a, b) => b - a);
  const fits = (line: string, fontSize: number, letterSpacing: number) =>
    estimateTextWidth(line, fontSize, letterSpacing) <= maxWidth;
  for (const fontSize of ordered) {
    const letterSpacing = round2(fontSize * tracking);
    const lines = wrapLines(clean, fontSize, maxWidth, letterSpacing);
    if (lines.length <= maxLines && lines.every((l) => fits(l, fontSize, letterSpacing))) {
      return { fontSize, letterSpacing, lines, text: clean, truncated: false };
    }
  }

  const fontSize = ordered[ordered.length - 1];
  const letterSpacing = round2(fontSize * tracking);
  // Keep up to maxLines lines; stop early at a line that overflows (a single over-long word).
  const lines: string[] = [];
  for (const line of wrapLines(clean, fontSize, maxWidth, letterSpacing)) {
    if (lines.length === maxLines) break;
    lines.push(line);
    if (!fits(line, fontSize, letterSpacing)) break;
  }
  const lastIndex = lines.length - 1;
  const words = lines[lastIndex].split(' ');
  let last = '';
  for (const word of words) {
    const candidate = last ? `${last} ${word}` : word;
    if (estimateTextWidth(`${candidate}…`, fontSize, letterSpacing) > maxWidth) break;
    last = candidate;
  }
  // A single word wider than the box: hard-cut by characters.
  if (!last) {
    for (const ch of words[0]) {
      if (estimateTextWidth(`${last}${ch}…`, fontSize, letterSpacing) > maxWidth) break;
      last += ch;
    }
  }
  lines[lastIndex] = `${last.replace(/[\s,.:;!?–—-]+$/u, '')}…`;
  return { fontSize, letterSpacing, lines, text: lines.join(' '), truncated: true };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

const FONT_SUBSETS = [
  ['latin', 'BVP latin'],
  ['vietnamese', 'BVP vi'],
  ['latin-ext', 'BVP latin-ext'],
] as const;
const FONT_WEIGHTS = [500, 700, 800] as const;
export const OG_FONT_FAMILY = FONT_SUBSETS.map(([, family]) => `'${family}'`).join(', ');

type SatoriFont = { name: string; data: Buffer; weight: 500 | 700 | 800; style: 'normal' };

let fontsPromise: Promise<SatoriFont[]> | undefined;

/** Static Be Vietnam Pro woff files, resolved from the project root (works in dev, build and tests). */
function loadFonts(): Promise<SatoriFont[]> {
  fontsPromise ??= Promise.all(
    FONT_SUBSETS.flatMap(([subset, name]) =>
      FONT_WEIGHTS.map(async (weight) => ({
        name,
        weight,
        style: 'normal' as const,
        data: await readFile(
          path.join(process.cwd(), 'node_modules/@fontsource/be-vietnam-pro/files', `be-vietnam-pro-${subset}-${weight}-normal.woff`),
        ),
      })),
    ),
  );
  return fontsPromise;
}

/** Same mark as src/components/layout/Logo.astro and public/favicon.svg. */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${OG_COLORS.brandFrom}"/><stop offset="1" stop-color="${OG_COLORS.brandTo}"/></linearGradient></defs><rect width="34" height="34" rx="10" fill="url(#g)"/><path d="M6 18.5h5.2l2.6-6.5 4.4 11 3.1-8 1.9 3.5H28" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOGO_SIZE = 52;

let logoPromise: Promise<string> | undefined;
function logoDataUri(): Promise<string> {
  logoPromise ??= sharp(Buffer.from(LOGO_SVG), { density: 72 * 4 })
    .resize(LOGO_SIZE * 2, LOGO_SIZE * 2)
    .png()
    .toBuffer()
    .then((b) => `data:image/png;base64,${b.toString('base64')}`);
  return logoPromise;
}

/** Artwork shown on the right: a cover image file, or generated SVG art (src/lib/cover.ts). */
export type OgArt = { file: string } | { svg: string };

const ART_WIDTH = 760;

/** Rasterise the art to a JPEG data URI at its on-card size (keeps the satori SVG small). */
async function artDataUri(art: OgArt): Promise<string> {
  const input = 'file' in art ? art.file : Buffer.from(art.svg);
  const buf = await sharp(input)
    .resize(ART_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/* Minimal element factory — satori takes React-like { type, props } objects. */
type Style = Record<string, string | number>;
type Child = OgNode | string;
interface OgNode {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown };
}
function h(type: string, style: Style, children?: Child | Child[], extra: Record<string, unknown> = {}): OgNode {
  return { type, props: { style, children, ...extra } };
}

function chip(label: string, color: string): OgNode {
  return h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 22px 9px 18px',
      borderRadius: 999,
      border: `2px solid ${hexToRgba(color, 0.55)}`,
      backgroundColor: hexToRgba(color, 0.14),
      color,
      fontSize: 24,
      fontWeight: 700,
    },
    [h('div', { width: 12, height: 12, borderRadius: 999, backgroundColor: color }), normalizeText(label)],
  );
}

export interface OgCardInput {
  title: string;
  /** Category chips (one for a post, several for the site card). */
  chips?: { label: string; color: string }[];
  /** Small text under the title (site card tagline). */
  subtitle?: string;
  /** Bottom-left items, joined with " · " (e.g. reading time, date). */
  meta?: string[];
  /** Bottom-right text, usually the site host. */
  host?: string;
  art: OgArt;
  siteName: string;
}

const PAD_X = 72;
const TITLE_WIDTH = 780;

/** Render one OG card to a PNG buffer. */
export async function renderOgImage(input: OgCardInput): Promise<Buffer> {
  const [fonts, logo, art] = await Promise.all([loadFonts(), logoDataUri(), artDataUri(input.art)]);
  const title = fitTitle(input.title, { maxWidth: TITLE_WIDTH, maxLines: 3 });
  const ink = OG_COLORS.ink;

  const root = h(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      display: 'flex',
      position: 'relative',
      boxSizing: 'border-box',
      backgroundColor: ink,
      color: OG_COLORS.fg,
      fontFamily: OG_FONT_FAMILY,
    },
    [
      h('img', { position: 'absolute', top: 0, right: 0, width: ART_WIDTH, height: OG_HEIGHT }, undefined, {
        src: art,
        width: ART_WIDTH,
        height: OG_HEIGHT,
      }),
      // Scrim: solid ink on the left fading into the art, plus a soft bottom fade for the meta row.
      h('div', {
        position: 'absolute',
        top: 0,
        right: 0,
        width: ART_WIDTH,
        height: OG_HEIGHT,
        backgroundImage: `linear-gradient(90deg, ${ink} 0%, ${hexToRgba(ink, 0.82)} 30%, ${hexToRgba(ink, 0.3)} 70%, ${hexToRgba(ink, 0)} 100%)`,
      }),
      h('div', {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: OG_WIDTH,
        height: 220,
        backgroundImage: `linear-gradient(0deg, ${hexToRgba(ink, 0.85)} 0%, ${hexToRgba(ink, 0)} 100%)`,
      }),
      h(
        'div',
        {
          // Absolute like the layers above, so document order decides painting (text on top).
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: OG_WIDTH,
          height: OG_HEIGHT,
          padding: `56px ${PAD_X}px 60px`,
          boxSizing: 'border-box',
        },
        [
          // Brand
          h('div', { display: 'flex', alignItems: 'center', gap: 16 }, [
            h('img', { width: LOGO_SIZE, height: LOGO_SIZE }, undefined, { src: logo, width: LOGO_SIZE, height: LOGO_SIZE }),
            h('div', { fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }, normalizeText(input.siteName)),
          ]),
          // Chips + title
          h('div', { display: 'flex', flexDirection: 'column', gap: 26, width: TITLE_WIDTH }, [
            ...(input.chips?.length
              ? [h('div', { display: 'flex', gap: 12 }, input.chips.map((c) => chip(c.label, c.color)))]
              : []),
            h(
              'div',
              {
                display: 'block',
                fontSize: title.fontSize,
                fontWeight: 800,
                lineHeight: 1.14,
                letterSpacing: title.letterSpacing,
                // No textWrap: 'balance' — in satori 0.63 it miscomputes the width together with lineClamp
                // (a 2-line title came out as 3 narrow, clamped lines).
                lineClamp: 3,
              },
              title.text,
            ),
            ...(input.subtitle
              ? [h('div', { fontSize: 30, fontWeight: 500, color: OG_COLORS.muted, lineHeight: 1.35 }, normalizeText(input.subtitle))]
              : []),
          ]),
          // Meta
          h(
            'div',
            { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, fontWeight: 500, color: OG_COLORS.muted },
            [
              h('div', { display: 'flex' }, normalizeText((input.meta ?? []).join(' · '))),
              h('div', { display: 'flex', color: OG_COLORS.fg, fontWeight: 700 }, input.host ?? ''),
            ],
          ),
        ],
      ),
      // Brand gradient rule along the bottom edge.
      h('div', {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: OG_WIDTH,
        height: 8,
        backgroundImage: `linear-gradient(90deg, ${OG_COLORS.brandFrom}, ${OG_COLORS.brandTo})`,
      }),
    ],
  );

  // satori's types expect a ReactNode; our plain { type, props } objects are exactly that shape.
  const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
