/**
 * Personal library stored in this browser only: bookmarks + reading history.
 * Shapes are documented in docs/DESIGN.md.
 *
 * Everything below the "Library page helpers" marker is pure (no DOM) except the thin
 * read/write wrappers, so it can be unit-tested in Node (tests/unit/library-store.test.ts).
 */
import { read, write } from '../lib/storage';

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  minutes: number;
  cover: string;
  date: string;
  savedAt: number;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  cover: string;
  category: string;
  minutes: number;
  /** 0..1 — how far through the article body */
  progress: number;
  scrollY: number;
  lastReadAt: number;
}

export const MAX_BOOKMARKS = 200;
export const MAX_HISTORY = 100;
export const FINISHED = 0.92;

export const getBookmarks = () => read<Bookmark[]>('bookmarks', []);
export const getHistory = () => read<HistoryItem[]>('history', []);
export const isSaved = (id: string) => getBookmarks().some((b) => b.id === id);

function emit() {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent('ns:bookmarks-changed', { detail: { ids: getBookmarks().map((b) => b.id) } }));
}

export function addBookmark(b: Omit<Bookmark, 'savedAt'>) {
  const list = getBookmarks().filter((x) => x.id !== b.id);
  list.unshift({ ...b, savedAt: Date.now() });
  write('bookmarks', list.slice(0, MAX_BOOKMARKS));
  emit();
}

export function removeBookmark(id: string) {
  write(
    'bookmarks',
    getBookmarks().filter((b) => b.id !== id),
  );
  emit();
}

/** Returns the new state (true = saved). */
export function toggleBookmark(b: Omit<Bookmark, 'savedAt'>): boolean {
  if (isSaved(b.id)) {
    removeBookmark(b.id);
    return false;
  }
  addBookmark(b);
  return true;
}

export function upsertHistory(item: Omit<HistoryItem, 'lastReadAt'>) {
  const list = getHistory();
  const prev = list.find((h) => h.id === item.id);
  // Never lower the furthest progress once finished; otherwise keep the latest position.
  const progress = prev && prev.progress >= FINISHED ? Math.max(prev.progress, item.progress) : item.progress;
  const next = [{ ...item, progress, lastReadAt: Date.now() }, ...list.filter((h) => h.id !== item.id)];
  write('history', next.slice(0, MAX_HISTORY));
}

export function removeHistory(id: string) {
  write(
    'history',
    getHistory().filter((h) => h.id !== id),
  );
}

export function clearAll(kind: 'bookmarks' | 'history') {
  write(kind, []);
  if (kind === 'bookmarks') emit();
}

export const inProgress = (h: HistoryItem) => h.progress > 0.05 && h.progress < FINISHED;
export const finished = (h: HistoryItem) => h.progress >= FINISHED;

/** Read a bookmark payload from a [data-bookmark] button's data attributes. */
export function fromDataset(el: HTMLElement): Omit<Bookmark, 'savedAt'> {
  const d = el.dataset;
  return {
    id: d.id!,
    title: d.title ?? '',
    url: d.url ?? '',
    description: d.description ?? '',
    category: d.category ?? '',
    minutes: Number(d.minutes) || 1,
    cover: d.cover ?? '',
    date: d.date ?? '',
  };
}

/* ------------------------------------------------------------------ */
/* Library page helpers (/thu-vien/)                                    */
/* ------------------------------------------------------------------ */

export type LibraryKind = 'saved' | 'reading' | 'done';
export type SortOrder = 'newest' | 'oldest';

/** One row on the library page — a bookmark or a history item, normalised. */
export interface LibraryEntry {
  kind: LibraryKind;
  id: string;
  title: string;
  url: string;
  cover: string;
  category: string;
  minutes: number;
  description: string;
  /** savedAt (bookmarks) or lastReadAt (history), in ms. */
  time: number;
  /** 0..1 reading progress when known (saved items borrow it from history). */
  progress: number | null;
}

/** "còn ~N phút" — never below 1 minute. */
export function remainingMinutes(minutes: number, progress: number): number {
  const m = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return Math.max(1, Math.round(m * (1 - p)));
}

/** Split the stored data into the three tabs: Đã lưu · Đang đọc · Đã đọc. */
export function toEntries(bookmarks: Bookmark[], history: HistoryItem[]): Record<LibraryKind, LibraryEntry[]> {
  const progressById = new Map(history.map((h) => [h.id, h.progress]));
  const saved: LibraryEntry[] = bookmarks.map((b) => ({
    kind: 'saved',
    id: b.id,
    title: b.title,
    url: b.url,
    cover: b.cover,
    category: b.category,
    minutes: b.minutes,
    description: b.description,
    time: b.savedAt,
    progress: progressById.get(b.id) ?? null,
  }));
  const fromHistory = (h: HistoryItem, kind: LibraryKind): LibraryEntry => ({
    kind,
    id: h.id,
    title: h.title,
    url: h.url,
    cover: h.cover,
    category: h.category,
    minutes: h.minutes,
    description: '',
    time: h.lastReadAt,
    progress: h.progress,
  });
  return {
    saved,
    // Anything opened but not finished counts as "đang đọc" (incl. "mới bắt đầu").
    reading: history.filter((h) => !finished(h)).map((h) => fromHistory(h, 'reading')),
    done: history.filter(finished).map((h) => fromHistory(h, 'done')),
  };
}

/** Stable sort by time; returns a new array. */
export function sortEntries<T extends { time: number }>(list: T[], order: SortOrder): T[] {
  const dir = order === 'oldest' ? 1 : -1;
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.time - b.item.time) * dir || a.i - b.i)
    .map((x) => x.item);
}

/** Insert `item` into a newest-first list at the position its timestamp belongs (replacing the same id). */
function insertByTime<T extends { id: string }>(list: T[], item: T, time: (x: T) => number): T[] {
  const rest = list.filter((x) => x.id !== item.id);
  const at = rest.findIndex((x) => time(x) < time(item));
  if (at === -1) rest.push(item);
  else rest.splice(at, 0, item);
  return rest;
}

/** Undo a removal: put the bookmark back with its original savedAt (and position). */
export function restoreBookmark(b: Bookmark) {
  write('bookmarks', insertByTime(getBookmarks(), b, (x) => x.savedAt).slice(0, MAX_BOOKMARKS));
  emit();
}

/** Undo a removal from history (keeps the original lastReadAt). */
export function restoreHistory(h: HistoryItem) {
  write('history', insertByTime(getHistory(), h, (x) => x.lastReadAt).slice(0, MAX_HISTORY));
}

/** Remove matching history items; returns what was removed (for undo). */
export function removeHistoryWhere(pred: (h: HistoryItem) => boolean): HistoryItem[] {
  const all = getHistory();
  const removed = all.filter(pred);
  if (removed.length) write('history', all.filter((h) => !pred(h)));
  return removed;
}

/** Undo "Xoá tất cả": merge the removed items back in. */
export function restoreMany(kind: 'bookmarks' | 'history', items: Bookmark[] | HistoryItem[]) {
  if (kind === 'bookmarks') {
    write('bookmarks', mergeBookmarks(getBookmarks(), items as Bookmark[]));
    emit();
  } else {
    write('history', mergeHistory(getHistory(), items as HistoryItem[]));
  }
}

/* ---------- Export / import (move the library between devices) ---------- */

export interface LibraryExport {
  app: 'nhip-so';
  kind: 'library';
  version: 1;
  exportedAt: string;
  bookmarks: Bookmark[];
  history: HistoryItem[];
}

export function exportLibrary(now: number = Date.now()): LibraryExport {
  return {
    app: 'nhip-so',
    kind: 'library',
    version: 1,
    exportedAt: new Date(now).toISOString(),
    bookmarks: getBookmarks(),
    history: getHistory(),
  };
}

/** `nhip-so-thu-vien-2026-11-09.json` */
export function exportFileName(now: number = Date.now()): string {
  return `nhip-so-thu-vien-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/**
 * Only same-site, root-relative paths are allowed for links/images coming from storage or files
 * ("/bai-viet/x/"), never "javascript:", "//evil.com" or absolute URLs.
 */
export function safePath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (!v.startsWith('/') || v.startsWith('//') || /[\\\u0000-\u001f\s]/.test(v)) return '';
  return v.slice(0, 500);
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function sanitizeBookmark(x: unknown, now: number = Date.now()): Bookmark | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 200).trim();
  const url = safePath(x.url);
  if (!id || !url) return null;
  return {
    id,
    title: str(x.title) || id,
    url,
    description: str(x.description, 600),
    category: str(x.category, 40),
    minutes: Math.round(num(x.minutes, 1, 999, 1)),
    cover: safePath(x.cover),
    date: str(x.date, 40),
    savedAt: num(x.savedAt, 0, now, now),
  };
}

export function sanitizeHistory(x: unknown, now: number = Date.now()): HistoryItem | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 200).trim();
  const url = safePath(x.url);
  if (!id || !url) return null;
  return {
    id,
    title: str(x.title) || id,
    url,
    cover: safePath(x.cover),
    category: str(x.category, 40),
    minutes: Math.round(num(x.minutes, 1, 999, 1)),
    progress: num(x.progress, 0, 1, 0),
    scrollY: Math.round(num(x.scrollY, 0, 10_000_000, 0)),
    lastReadAt: num(x.lastReadAt, 0, now, now),
  };
}

/**
 * Parse an exported file. Throws an Error with a friendly Vietnamese message when the file
 * isn't a Nhịp Số library. Invalid rows are dropped silently.
 */
export function parseLibraryFile(text: string, now: number = Date.now()): { bookmarks: Bookmark[]; history: HistoryItem[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File này không phải JSON hợp lệ.');
  }
  if (!isObj(data) || data.app !== 'nhip-so' || (!Array.isArray(data.bookmarks) && !Array.isArray(data.history))) {
    throw new Error('Đây không phải file thư viện của Nhịp Số.');
  }
  const bookmarks = (Array.isArray(data.bookmarks) ? data.bookmarks : [])
    .map((b) => sanitizeBookmark(b, now))
    .filter((b): b is Bookmark => b !== null);
  const history = (Array.isArray(data.history) ? data.history : [])
    .map((h) => sanitizeHistory(h, now))
    .filter((h): h is HistoryItem => h !== null);
  return { bookmarks, history };
}

/** Union by id; the more recently saved copy wins. Newest first, capped. */
export function mergeBookmarks(current: Bookmark[], incoming: Bookmark[]): Bookmark[] {
  const map = new Map<string, Bookmark>();
  for (const b of [...current, ...incoming]) {
    const prev = map.get(b.id);
    if (!prev || b.savedAt > prev.savedAt) map.set(b.id, b);
  }
  return [...map.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_BOOKMARKS);
}

/** Union by id; the most recent read wins, but a finished article never goes back to unfinished. */
export function mergeHistory(current: HistoryItem[], incoming: HistoryItem[]): HistoryItem[] {
  const map = new Map<string, HistoryItem>();
  for (const h of [...current, ...incoming]) {
    const prev = map.get(h.id);
    if (!prev) {
      map.set(h.id, h);
      continue;
    }
    const newer = h.lastReadAt > prev.lastReadAt ? h : prev;
    const done = Math.max(prev.progress, h.progress) >= FINISHED;
    map.set(h.id, done ? { ...newer, progress: Math.max(prev.progress, h.progress) } : newer);
  }
  return [...map.values()].sort((a, b) => b.lastReadAt - a.lastReadAt).slice(0, MAX_HISTORY);
}

/** Merge an imported library into this browser. Returns how many new rows were added. */
export function importLibrary(data: { bookmarks: Bookmark[]; history: HistoryItem[] }): { bookmarks: number; history: number } {
  const curB = getBookmarks();
  const curH = getHistory();
  const nextB = mergeBookmarks(curB, data.bookmarks);
  const nextH = mergeHistory(curH, data.history);
  const had = (ids: { id: string }[]) => new Set(ids.map((x) => x.id));
  const hb = had(curB);
  const hh = had(curH);
  write('bookmarks', nextB);
  write('history', nextH);
  emit();
  return {
    bookmarks: nextB.filter((b) => !hb.has(b.id)).length,
    history: nextH.filter((h) => !hh.has(h.id)).length,
  };
}
