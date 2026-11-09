/**
 * /offline/ — lists what this browser can open without a network (the SW's saved + visited-page
 * caches), with titles/covers from the library in localStorage or, failing that, from the cached HTML.
 * The page is also what the service worker shows for any navigation it can't serve offline.
 * All rendering is textContent / attributes only (cached HTML is parsed, never inserted).
 */
import { CATEGORIES } from '../config';
import { getBookmarks, getHistory, safePath, FINISHED, type Bookmark, type HistoryItem } from './library-store';
import { offlineIndex } from './library-offline';

export const OFFLINE_PATH = '/offline/';
const ARTICLE = /^\/bai-viet\/[^/]+\/$/;
const CAT = new Map(CATEGORIES.map((c) => [c.id as string, c]));

export interface OfflineArticle {
  path: string;
  title: string;
  cover: string;
  category: string;
  minutes: number;
  saved: boolean;
  progress: number | null;
  /** savedAt / lastReadAt — for ordering; 0 when unknown */
  time: number;
}
export interface OfflinePage {
  path: string;
  title: string;
}
export interface PageMeta {
  title: string;
  cover: string;
  category: string;
  minutes: number;
}

/** "Bài X · Nhịp Số" → "Bài X". */
export function cleanTitle(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*·\s*Nhịp Số\s*$/u, '')
    .trim();
}

const decode = (fragment: string): Element | null => {
  const tpl = document.createElement('template');
  tpl.innerHTML = fragment; // inert: <template> content never runs scripts or loads resources
  return tpl.content.firstElementChild;
};

/** Title (and, for articles, cover/category/minutes) from a cached page's HTML, without parsing all of it. */
export function metaFromHtml(html: string, path: string): PageMeta {
  const out: PageMeta = { title: '', cover: '', category: '', minutes: 0 };
  for (const [tag] of html.matchAll(/<button\b[^>]*\bdata-bookmark\b[^>]*>/gi)) {
    const el = decode(tag) as HTMLElement | null;
    if (!el || safePath(el.dataset.url) !== path) continue;
    out.title = cleanTitle(el.dataset.title);
    out.cover = safePath(el.dataset.cover);
    out.category = el.dataset.category ?? '';
    out.minutes = Number(el.dataset.minutes) || 0;
    break;
  }
  if (!out.title) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m) out.title = cleanTitle(decode(`<p>${m[1]}</p>`)?.textContent);
  }
  return out;
}

/** Friendly names for non-article pages ("/" → "Trang chủ"). */
export function pageLabel(path: string, title: string): string {
  if (path === '/') return 'Trang chủ';
  return title || decodeURIComponent(path.replace(/^\/|\/$/g, '')).replace(/[-/]+/g, ' ') || path;
}

/**
 * Merge cache contents with the library. Saved first (newest saved first), then visited articles
 * (most recently read first; unknown → most recently cached first), then other pages.
 */
export function buildOfflineList(
  index: { saved: Iterable<string>; pages: Iterable<string> },
  library: { bookmarks: Bookmark[]; history: HistoryItem[] },
  metaFor: (path: string) => PageMeta | undefined,
): { articles: OfflineArticle[]; pages: OfflinePage[] } {
  const bm = new Map(library.bookmarks.map((b) => [safePath(b.url), b]));
  const hist = new Map(library.history.map((h) => [safePath(h.url), h]));
  const savedSet = new Set([...index.saved].filter((p) => p !== OFFLINE_PATH));
  // Cache order is oldest → newest; reverse so "unknown time" items still come newest first.
  const pagesList = [...index.pages].filter((p) => p !== OFFLINE_PATH && !savedSet.has(p)).reverse();

  const articles: OfflineArticle[] = [];
  const pages: OfflinePage[] = [];
  const seen = new Set<string>();
  const add = (path: string, saved: boolean, order: number) => {
    if (seen.has(path)) return;
    seen.add(path);
    const b = bm.get(path);
    const h = hist.get(path);
    const meta = !b && !h ? metaFor(path) : undefined;
    if (!ARTICLE.test(path)) {
      pages.push({ path, title: pageLabel(path, meta?.title ?? '') });
      return;
    }
    articles.push({
      path,
      title: b?.title || h?.title || meta?.title || 'Bài viết không tên',
      cover: safePath(b?.cover || h?.cover || meta?.cover || ''),
      category: b?.category || h?.category || meta?.category || '',
      minutes: b?.minutes || h?.minutes || meta?.minutes || 0,
      saved,
      progress: h ? h.progress : null,
      time: (saved ? b?.savedAt : h?.lastReadAt) || -order,
    });
  };
  [...savedSet].forEach((p, i) => add(p, true, i));
  pagesList.forEach((p, i) => add(p, false, i));

  const byTime = (a: OfflineArticle, b: OfflineArticle) => b.time - a.time;
  articles.sort((a, b) => Number(b.saved) - Number(a.saved) || byTime(a, b));
  pages.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : 0));
  return { articles, pages };
}

/* ------------------------------------------------------------------ */
/* DOM                                                                  */
/* ------------------------------------------------------------------ */

const q = <T extends Element>(root: ParentNode, f: string) => root.querySelector<T>(`[data-f="${f}"]`);

export function buildArticleRow(tpl: HTMLTemplateElement, a: OfflineArticle): HTMLLIElement {
  const li = (tpl.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
  const cat = CAT.get(a.category);
  if (cat) li.style.setProperty('--c', cat.color);

  const link = q<HTMLAnchorElement>(li, 'link')!;
  link.href = a.path;
  link.textContent = a.title;

  const img = q<HTMLImageElement>(li, 'img')!;
  if (a.cover) {
    img.src = a.cover;
    img.addEventListener('error', () => img.remove(), { once: true });
  } else img.remove();

  const catEl = q<HTMLElement>(li, 'cat')!;
  if (cat) q(li, 'cat-name')!.textContent = cat.name;
  else catEl.remove();

  q<HTMLElement>(li, 'saved')!.hidden = !a.saved;
  q<HTMLElement>(li, 'visited')!.hidden = a.saved;

  const mins = q<HTMLElement>(li, 'minutes')!;
  if (a.minutes > 0) mins.textContent = `${Math.round(a.minutes)} phút đọc`;
  else mins.remove();

  const prog = q<HTMLElement>(li, 'progress')!;
  if (a.progress != null && a.progress > 0.05) {
    const pct = Math.round(Math.min(1, a.progress) * 100);
    prog.textContent = a.progress >= FINISHED ? 'Đã đọc xong' : `Đã đọc ${pct}%`;
  } else prog.remove();
  return li;
}

async function cachedHtml(path: string): Promise<string | null> {
  try {
    const res = await caches.match(path, { ignoreSearch: true, ignoreVary: true });
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}

async function hasCached(path: string): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' && !!(await caches.match(path, { ignoreVary: true }));
  } catch {
    return false;
  }
}

export async function initOfflinePage(root: HTMLElement = document.body): Promise<void> {
  const fallback = location.pathname !== OFFLINE_PATH; // shown by the SW in place of another page
  const status = root.querySelector<HTMLElement>('[data-off-status]');

  // ---------- Headline: offline fallback vs. a direct visit while online ----------
  const where = root.querySelector<HTMLElement>('[data-off-where]');
  if (fallback && where) {
    let shown = location.pathname;
    try {
      shown = decodeURIComponent(shown);
    } catch {
      /* keep raw */
    }
    where.hidden = false;
    q(where, 'path')!.textContent = shown;
  }
  if (!fallback && navigator.onLine) {
    root.querySelector<HTMLElement>('[data-off-title]')!.textContent = 'Đọc khi không có mạng';
    root.querySelector<HTMLElement>('[data-off-lede]')!.textContent =
      'Những bài dưới đây đã có sẵn trên máy bạn, nên vẫn mở được lúc mất sóng hay đi máy bay.';
  }

  // ---------- Retry ----------
  const retry = () => {
    if (fallback) location.reload();
    else {
      const ref = document.referrer && new URL(document.referrer, location.href);
      location.href = ref && ref.origin === location.origin && ref.pathname !== OFFLINE_PATH ? ref.href : '/';
    }
  };
  root.querySelector('[data-off-retry]')?.addEventListener('click', retry);
  addEventListener('online', () => {
    if (!fallback) return;
    if (status) status.textContent = 'Đã có mạng trở lại — đang tải lại trang…';
    setTimeout(() => location.reload(), 900);
  });

  // ---------- What's on this device ----------
  const listEl = root.querySelector<HTMLElement>('[data-off-list]');
  const tpl = root.querySelector<HTMLTemplateElement>('template[data-tpl="article"]');
  const listWrap = root.querySelector<HTMLElement>('[data-off-articles]');
  const count = root.querySelector<HTMLElement>('[data-off-count]');
  const pagesWrap = root.querySelector<HTMLElement>('[data-off-pages]');
  const pagesList = root.querySelector<HTMLElement>('[data-off-pages-list]');
  const empty = root.querySelector<HTMLElement>('[data-off-empty]');
  if (!listEl || !tpl) return;

  const index = await offlineIndex();
  if (await hasCached('/')) index.pages.add('/'); // precached home page

  const library = { bookmarks: getBookmarks(), history: getHistory() };
  const known = new Set([...library.bookmarks, ...library.history].map((x) => safePath(x.url)));
  const metas = new Map<string, PageMeta>();
  await Promise.all(
    [...index.saved, ...index.pages]
      .filter((p) => p !== OFFLINE_PATH && !known.has(p))
      .slice(0, 80)
      .map(async (p) => {
        const html = await cachedHtml(p);
        if (html) metas.set(p, metaFromHtml(html, p));
      }),
  );

  const { articles, pages } = buildOfflineList(index, library, (p) => metas.get(p));

  listEl.replaceChildren(...articles.map((a) => buildArticleRow(tpl, a)));
  listEl.removeAttribute('aria-busy');
  if (listWrap) listWrap.hidden = articles.length === 0;
  if (count) {
    const nSaved = articles.filter((a) => a.saved).length;
    count.textContent = articles.length
      ? `${articles.length} bài${nSaved ? ` · ${nSaved} bài bạn đã lưu` : ''}`
      : '';
  }

  if (pagesWrap && pagesList) {
    pagesList.replaceChildren(
      ...pages.slice(0, 12).map((p) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'off-chip';
        a.href = p.path;
        a.textContent = p.title;
        li.append(a);
        return li;
      }),
    );
    pagesWrap.hidden = pages.length === 0;
  }
  if (empty) empty.hidden = articles.length > 0;
}
