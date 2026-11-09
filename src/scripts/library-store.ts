/**
 * Personal library stored in this browser only: bookmarks + reading history.
 * Shapes are documented in docs/DESIGN.md.
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

const MAX_BOOKMARKS = 200;
const MAX_HISTORY = 100;
export const FINISHED = 0.92;

export const getBookmarks = () => read<Bookmark[]>('bookmarks', []);
export const getHistory = () => read<HistoryItem[]>('history', []);
export const isSaved = (id: string) => getBookmarks().some((b) => b.id === id);

function emit() {
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
