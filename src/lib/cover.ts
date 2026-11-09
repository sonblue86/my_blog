/**
 * Deterministic generative cover art ("nhịp" = rhythm): every post without a cover image gets a unique,
 * on-brand SVG derived from its slug + category. Same input -> same picture, so builds are stable.
 */

type Palette = { bg: [string, string]; blobs: string[]; ink: string };

const PALETTES: Record<string, Palette[]> = {
  ai: [
    { bg: ['#1b1446', '#3b1d8f'], blobs: ['#7c5cff', '#c74bff', '#ff7ab6', '#5b8cff'], ink: '#f4f0ff' },
    { bg: ['#120f2e', '#2a1f6b'], blobs: ['#8f7bff', '#4cc9ff', '#e05cff', '#6a5cff'], ink: '#eef0ff' },
  ],
  'cong-nghe': [
    { bg: ['#06213a', '#0b3f6b'], blobs: ['#1fb6ff', '#2de0c4', '#4f7cff', '#7af0ff'], ink: '#e9fbff' },
    { bg: ['#0a1830', '#13325a'], blobs: ['#38bdf8', '#22d3ee', '#818cf8', '#2dd4bf'], ink: '#eaf6ff' },
  ],
  'doi-song': [
    { bg: ['#062a22', '#0f4a3a'], blobs: ['#34d399', '#fbbf24', '#a3e635', '#2dd4bf'], ink: '#f0fff8' },
    { bg: ['#2a1a0a', '#4a2c12'], blobs: ['#fb923c', '#fbbf24', '#f472b6', '#34d399'], ink: '#fff7ed' },
  ],
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600;
const H = 900;
const r1 = (n: number) => Math.round(n * 10) / 10;

function waves(rand: () => number, ink: string): string {
  const lines: string[] = [];
  const count = 9 + Math.floor(rand() * 6);
  const amp = 40 + rand() * 90;
  const freq = 1.2 + rand() * 2.2;
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const y0 = H * 0.25 + (i * H * 0.55) / count;
    let d = `M0 ${r1(y0)}`;
    for (let x = 0; x <= W; x += 40) {
      const t = (x / W) * Math.PI * 2 * freq + phase + i * 0.35;
      const y = y0 + Math.sin(t) * amp * (0.4 + (i / count) * 0.8);
      d += ` L${x} ${r1(y)}`;
    }
    lines.push(
      `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="${r1(0.08 + (i / count) * 0.32)}" stroke-width="2"/>`,
    );
  }
  return lines.join('');
}

function bars(rand: () => number, ink: string): string {
  const out: string[] = [];
  const n = 36 + Math.floor(rand() * 20);
  const gap = W / n;
  const base = H * (0.62 + rand() * 0.12);
  for (let i = 0; i < n; i++) {
    const h = (Math.sin(i * 0.45 + rand() * 0.6) * 0.5 + 0.6) * (120 + rand() * 260);
    out.push(
      `<rect x="${r1(i * gap + gap * 0.3)}" y="${r1(base - h)}" width="${r1(gap * 0.4)}" height="${r1(h)}" rx="${r1(gap * 0.2)}" fill="${ink}" fill-opacity="${r1(0.12 + rand() * 0.25)}"/>`,
    );
  }
  return out.join('');
}

function rings(rand: () => number, ink: string): string {
  const out: string[] = [];
  const cx = W * (0.55 + rand() * 0.35);
  const cy = H * (0.3 + rand() * 0.5);
  for (let i = 1; i <= 14; i++) {
    out.push(
      `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${i * 58}" fill="none" stroke="${ink}" stroke-opacity="${r1(0.32 - i * 0.018)}" stroke-width="${i % 3 === 0 ? 3 : 1.5}"/>`,
    );
  }
  return out.join('');
}

function dots(rand: () => number, ink: string): string {
  const out: string[] = [];
  const step = 44;
  const cx = W * (0.3 + rand() * 0.4);
  const cy = H * (0.3 + rand() * 0.4);
  for (let x = step / 2; x < W; x += step) {
    for (let y = step / 2; y < H; y += step) {
      const dist = Math.hypot(x - cx, y - cy);
      const r = Math.max(0, 7 - dist / 110);
      if (r > 0.6) out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${ink}" fill-opacity="0.5"/>`);
    }
  }
  return out.join('');
}

const PATTERNS = [waves, bars, rings, dots];

export interface CoverOptions {
  seed: string;
  category: string;
}

export function coverSvg({ seed, category }: CoverOptions): string {
  const rand = mulberry32(hash(seed));
  const set = PALETTES[category] ?? PALETTES.ai;
  const pal = set[Math.floor(rand() * set.length)];
  const id = `c${hash(seed).toString(36)}`;

  const blobs = pal.blobs
    .map((color, i) => {
      const cx = r1(rand() * W);
      const cy = r1(rand() * H);
      const r = r1(260 + rand() * 420);
      return `<radialGradient id="${id}b${i}"><stop offset="0" stop-color="${color}" stop-opacity=".85"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}b${i})"/>`;
    })
    .join('');

  const pattern = PATTERNS[Math.floor(rand() * PATTERNS.length)](rand, pal.ink);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.bg[0]}"/><stop offset="1" stop-color="${pal.bg[1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id}g)"/>${blobs}${pattern}</svg>`;
}

export function coverDataUri(opts: CoverOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverSvg(opts))}`;
}
