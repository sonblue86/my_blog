// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  FINISHED,
  type Bookmark,
  type HistoryItem,
  getBookmarks,
  getHistory,
  addBookmark,
  removeBookmark,
  restoreBookmark,
  restoreHistory,
  removeHistoryWhere,
  restoreMany,
  remainingMinutes,
  toEntries,
  sortEntries,
  safePath,
  sanitizeBookmark,
  sanitizeHistory,
  parseLibraryFile,
  mergeBookmarks,
  mergeHistory,
  importLibrary,
  exportLibrary,
  exportFileName,
  finished,
} from '../../src/scripts/library-store';

const bm = (id: string, savedAt: number, extra: Partial<Bookmark> = {}): Bookmark => ({
  id,
  title: `Bài ${id}`,
  url: `/bai-viet/${id}/`,
  description: 'Mô tả',
  category: 'ai',
  minutes: 8,
  cover: `/covers/${id}.svg`,
  date: '2026-11-01T00:00:00.000Z',
  savedAt,
  ...extra,
});

const hi = (id: string, lastReadAt: number, progress: number): HistoryItem => ({
  id,
  title: `Bài ${id}`,
  url: `/bai-viet/${id}/`,
  cover: `/covers/${id}.svg`,
  category: 'doi-song',
  minutes: 10,
  progress,
  scrollY: 100,
  lastReadAt,
});

const setLS = (key: string, v: unknown) => localStorage.setItem(`ns:${key}`, JSON.stringify(v));

beforeEach(() => localStorage.clear());

describe('remainingMinutes', () => {
  it('rounds and never goes below 1', () => {
    expect(remainingMinutes(10, 0.45)).toBe(6);
    expect(remainingMinutes(10, 0.99)).toBe(1);
    expect(remainingMinutes(3, 0)).toBe(3);
  });
  it('tolerates junk input', () => {
    expect(remainingMinutes(NaN, NaN)).toBe(1);
    expect(remainingMinutes(5, 7)).toBe(1);
    expect(remainingMinutes(5, -1)).toBe(5);
  });
});

describe('toEntries', () => {
  it('splits history into reading / done and borrows progress for saved items', () => {
    const e = toEntries([bm('a', 10), bm('b', 5)], [hi('a', 20, 0.4), hi('c', 30, 0.01), hi('d', 40, FINISHED)]);
    expect(e.saved.map((x) => [x.id, x.progress])).toEqual([
      ['a', 0.4],
      ['b', null],
    ]);
    expect(e.reading.map((x) => x.id)).toEqual(['a', 'c']);
    expect(e.done.map((x) => x.id)).toEqual(['d']);
    expect(e.done[0].time).toBe(40);
    expect(e.saved[0].kind).toBe('saved');
  });
});

describe('sortEntries', () => {
  it('sorts newest / oldest and is stable', () => {
    const list = [
      { id: 'x', time: 2 },
      { id: 'y', time: 3 },
      { id: 'z', time: 2 },
    ];
    expect(sortEntries(list, 'newest').map((x) => x.id)).toEqual(['y', 'x', 'z']);
    expect(sortEntries(list, 'oldest').map((x) => x.id)).toEqual(['x', 'z', 'y']);
    expect(list.map((x) => x.id)).toEqual(['x', 'y', 'z']); // not mutated
  });
});

describe('undo helpers', () => {
  it('restoreBookmark puts the item back where its savedAt belongs and emits', () => {
    setLS('bookmarks', [bm('c', 30), bm('b', 20), bm('a', 10)]);
    const removed = getBookmarks()[1];
    let events = 0;
    document.addEventListener('ns:bookmarks-changed', () => events++);
    removeBookmark('b');
    expect(getBookmarks().map((b) => b.id)).toEqual(['c', 'a']);
    restoreBookmark(removed);
    expect(getBookmarks().map((b) => b.id)).toEqual(['c', 'b', 'a']);
    expect(getBookmarks()[1].savedAt).toBe(20);
    expect(events).toBe(2);
  });

  it('restoreBookmark does not duplicate when the item was re-added meanwhile', () => {
    setLS('bookmarks', [bm('a', 10)]);
    restoreBookmark(bm('a', 10));
    expect(getBookmarks()).toHaveLength(1);
  });

  it('restoreHistory inserts by lastReadAt', () => {
    setLS('history', [hi('c', 30, 0.5), hi('a', 10, 0.5)]);
    restoreHistory(hi('b', 20, 0.3));
    expect(getHistory().map((h) => h.id)).toEqual(['c', 'b', 'a']);
    restoreHistory(hi('z', 1, 0.3));
    expect(getHistory().map((h) => h.id).at(-1)).toBe('z');
  });

  it('removeHistoryWhere + restoreMany round-trips "Xoá tất cả" on one tab only', () => {
    setLS('history', [hi('a', 30, 0.5), hi('b', 20, 1), hi('c', 10, 0.2)]);
    const removed = removeHistoryWhere((h) => !finished(h));
    expect(removed.map((h) => h.id)).toEqual(['a', 'c']);
    expect(getHistory().map((h) => h.id)).toEqual(['b']);
    restoreMany('history', removed);
    expect(getHistory().map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('restoreMany for bookmarks', () => {
    const all = [bm('b', 20), bm('a', 10)];
    setLS('bookmarks', all);
    localStorage.setItem('ns:bookmarks', '[]');
    restoreMany('bookmarks', all);
    expect(getBookmarks().map((b) => b.id)).toEqual(['b', 'a']);
  });
});

describe('safePath', () => {
  it('accepts root-relative paths only', () => {
    expect(safePath('/bai-viet/x/')).toBe('/bai-viet/x/');
    expect(safePath('javascript:alert(1)')).toBe('');
    expect(safePath('//evil.example/x')).toBe('');
    expect(safePath('https://evil.example/')).toBe('');
    expect(safePath('/\\evil')).toBe('');
    expect(safePath('/a b')).toBe('');
    expect(safePath(42)).toBe('');
  });
});

describe('sanitize', () => {
  const now = 1_000_000;
  it('clamps numbers and drops unsafe urls', () => {
    const b = sanitizeBookmark({ id: 'x', url: '/bai-viet/x/', cover: 'javascript:1', minutes: '5000', savedAt: now * 2 }, now);
    expect(b).toMatchObject({ id: 'x', title: 'x', cover: '', minutes: 999, savedAt: now });
    expect(sanitizeBookmark({ id: 'x', url: 'javascript:alert(1)' }, now)).toBeNull();
    expect(sanitizeBookmark({ url: '/a/' }, now)).toBeNull();
    expect(sanitizeBookmark('nope', now)).toBeNull();
    const h = sanitizeHistory({ id: 'y', url: '/bai-viet/y/', progress: 3, scrollY: -5, lastReadAt: 5 }, now);
    expect(h).toMatchObject({ progress: 1, scrollY: 0, lastReadAt: 5, minutes: 1 });
  });
});

describe('parseLibraryFile', () => {
  it('rejects non-JSON and foreign files with a friendly message', () => {
    expect(() => parseLibraryFile('{oops')).toThrow(/JSON/);
    expect(() => parseLibraryFile('{"bookmarks": []}')).toThrow(/Gì thế nhỉ/);
    expect(() => parseLibraryFile('[]')).toThrow(/Gì thế nhỉ/);
  });
  it('keeps valid rows and drops invalid ones', () => {
    const text = JSON.stringify({
      app: 'nhip-so', // internal format id, unchanged by the rebrand so older backups still import
      version: 1,
      bookmarks: [bm('a', 1), { id: 'bad', url: 'http://x' }, null],
      history: [hi('b', 2, 0.5)],
    });
    const r = parseLibraryFile(text, 10);
    expect(r.bookmarks.map((b) => b.id)).toEqual(['a']);
    expect(r.history.map((h) => h.id)).toEqual(['b']);
  });
  it('round-trips exportLibrary()', () => {
    setLS('bookmarks', [bm('a', 5)]);
    setLS('history', [hi('b', 6, 0.3)]);
    const r = parseLibraryFile(JSON.stringify(exportLibrary(100)), 100);
    expect(r.bookmarks).toEqual([bm('a', 5)]);
    expect(r.history).toEqual([hi('b', 6, 0.3)]);
  });
});

describe('merge', () => {
  it('mergeBookmarks: union, newest copy wins, sorted newest first', () => {
    const r = mergeBookmarks([bm('a', 10, { title: 'old' }), bm('b', 5)], [bm('a', 20, { title: 'new' }), bm('c', 15)]);
    expect(r.map((b) => [b.id, b.title])).toEqual([
      ['a', 'new'],
      ['c', 'Bài c'],
      ['b', 'Bài b'],
    ]);
  });
  it('mergeHistory: most recent read wins but finished stays finished', () => {
    const r = mergeHistory([hi('a', 10, 1)], [hi('a', 20, 0.3), hi('b', 5, 0.5)]);
    expect(r[0]).toMatchObject({ id: 'a', lastReadAt: 20, progress: 1 });
    expect(r.map((h) => h.id)).toEqual(['a', 'b']);
  });
  it('importLibrary reports only newly added rows', () => {
    setLS('bookmarks', [bm('a', 10)]);
    const res = importLibrary({ bookmarks: [bm('a', 11), bm('b', 3)], history: [hi('c', 1, 0.2)] });
    expect(res).toEqual({ bookmarks: 1, history: 1 });
    expect(getBookmarks().map((b) => b.id)).toEqual(['a', 'b']);
  });
});

describe('exportFileName', () => {
  it('is dated', () => {
    expect(exportFileName(Date.UTC(2026, 10, 9))).toBe('githenhi-thu-vien-2026-11-09.json');
  });
});

describe('addBookmark', () => {
  it('still prepends newest first (existing behaviour)', () => {
    addBookmark({ ...bm('a', 0) });
    addBookmark({ ...bm('b', 0) });
    expect(getBookmarks().map((b) => b.id)).toEqual(['b', 'a']);
  });
});
