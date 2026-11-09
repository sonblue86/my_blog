/**
 * Reader preferences ("Tuỳ chỉnh đọc"). Stored in localStorage 'ns:reader' with the shape
 * `{ font?, scale?, leading?, width? }` — only values that differ from the defaults are kept.
 * Head.astro applies the stored value before first paint; this module applies live changes.
 */
import { read, write, remove } from '../lib/storage';

export type ReadingFont = 'sans' | 'serif' | 'display';
export interface ReaderPrefs {
  font?: ReadingFont;
  scale?: number;
  leading?: number;
  /** Column width in `ch`. */
  width?: number;
}
export type ResolvedPrefs = Required<ReaderPrefs>;

export const KEY = 'reader';
export const FONTS: { value: ReadingFont; label: string }[] = [
  { value: 'sans', label: 'Không chân' },
  { value: 'serif', label: 'Có chân' },
  { value: 'display', label: 'Be Vietnam' },
];
/** 7 font-size steps (multipliers of --reader-size). */
export const SCALES = [0.88, 0.94, 1, 1.08, 1.16, 1.24, 1.32] as const;
export const LEADINGS = [
  { value: 1.6, label: 'Gọn' },
  { value: 1.75, label: 'Vừa' },
  { value: 1.95, label: 'Thoáng' },
] as const;
export const WIDTHS = [
  { value: 60, label: 'Hẹp' },
  { value: 68, label: 'Vừa' },
  { value: 78, label: 'Rộng' },
] as const;
export const DEFAULTS: ResolvedPrefs = { font: 'sans', scale: 1, leading: 1.75, width: 68 };

const nearest = (list: readonly number[], v: number) =>
  list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Validate anything (e.g. a hand-edited localStorage value) into full, snapped preferences. */
export function resolvePrefs(raw: unknown): ResolvedPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const font = FONTS.some((f) => f.value === r.font) ? (r.font as ReadingFont) : DEFAULTS.font;
  const scale = num(r.scale);
  const leading = num(r.leading);
  const width = num(r.width);
  return {
    font,
    scale: scale === undefined ? DEFAULTS.scale : nearest(SCALES, scale),
    leading: leading === undefined ? DEFAULTS.leading : nearest(LEADINGS.map((l) => l.value), leading),
    width: width === undefined ? DEFAULTS.width : nearest(WIDTHS.map((w) => w.value), width),
  };
}

/** Strip default values: what gets persisted. Returns {} for all-defaults. */
export function compactPrefs(p: ResolvedPrefs): ReaderPrefs {
  const out: ReaderPrefs = {};
  for (const k of Object.keys(DEFAULTS) as (keyof ResolvedPrefs)[]) {
    if (p[k] !== DEFAULTS[k]) (out as Record<string, unknown>)[k] = p[k];
  }
  return out;
}

export function isDefault(p: ResolvedPrefs): boolean {
  return Object.keys(compactPrefs(p)).length === 0;
}

/** Index of the current scale step and the next one in `dir` (clamped). */
export function scaleIndex(scale: number): number {
  return SCALES.indexOf(nearest(SCALES, scale) as (typeof SCALES)[number]);
}
export function stepScale(scale: number, dir: 1 | -1): number {
  const i = Math.max(0, Math.min(SCALES.length - 1, scaleIndex(scale) + dir));
  return SCALES[i];
}

/** Mirror of the inline script in Head.astro — keep both in sync. */
export function applyPrefs(p: ResolvedPrefs, root: HTMLElement = document.documentElement) {
  if (p.font === DEFAULTS.font) delete root.dataset.readingFont;
  else root.dataset.readingFont = p.font;
  const set = (prop: string, v: number, def: number, unit = '') =>
    v === def ? root.style.removeProperty(prop) : root.style.setProperty(prop, `${v}${unit}`);
  set('--reader-scale', p.scale, DEFAULTS.scale);
  set('--reader-leading', p.leading, DEFAULTS.leading);
  set('--reader-width', p.width, DEFAULTS.width, 'ch');
}

export function loadPrefs(): ResolvedPrefs {
  return resolvePrefs(read<unknown>(KEY, null));
}

export function savePrefs(p: ResolvedPrefs) {
  const compact = compactPrefs(p);
  if (Object.keys(compact).length) write(KEY, compact);
  else remove(KEY);
}

export function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
