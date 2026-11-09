// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { cleanTitle, metaFromHtml, pageLabel, buildOfflineList, buildArticleRow, type PageMeta } from '../../src/scripts/library-offline-page';
import type { Bookmark, HistoryItem } from '../../src/scripts/library-store';

const bm = (id: string, savedAt: number, extra: Partial<Bookmark> = {}): Bookmark => ({
  id,
  title: `Bài ${id}`,
  url: `/bai-viet/${id}/`,
  description: '',
  category: 'ai',
  minutes: 7,
  cover: `/covers/${id}.svg`,
  date: '',
  savedAt,
  ...extra,
});
const hi = (id: string, lastReadAt: number, progress = 0.4): HistoryItem => ({
  id,
  title: `Đã đọc ${id}`,
  url: `/bai-viet/${id}/`,
  cover: '',
  category: 'cong-nghe',
  minutes: 5,
  progress,
  scrollY: 0,
  lastReadAt,
});

describe('cleanTitle / pageLabel', () => {
  it('drops the site suffix and squashes whitespace', () => {
    expect(cleanTitle('RAG là gì?  ·  Nhịp Số')).toBe('RAG là gì?');
    expect(cleanTitle('  Thư viện\n của bạn · Nhịp Số ')).toBe('Thư viện của bạn');
    expect(cleanTitle(null)).toBe('');
  });
  it('names the home page and falls back to the path', () => {
    expect(pageLabel('/', 'Nhịp Số — AI')).toBe('Trang chủ');
    expect(pageLabel('/thu-vien/', 'Thư viện của bạn')).toBe('Thư viện của bạn');
    expect(pageLabel('/chuyen-muc/ai/', '')).toBe('chuyen muc ai');
  });
});

describe('metaFromHtml', () => {
  const html = `<!doctype html><html><head><title>Ghi chép &amp; suy nghĩ · Nhịp Số</title></head><body>
    <button data-bookmark data-url="/bai-viet/khac/" data-title="Bài khác"></button>
    <button type="button" class="bookmark-btn" data-bookmark data-id="x" data-title="Ghi chép &amp; “suy nghĩ”" data-url="/bai-viet/x/" data-category="doi-song" data-minutes="5" data-cover="/_astro/cover.AbCdEfGh.webp" onclick="alert(1)"></button>
    <script>window.__ran = true</script></body></html>`;

  it('reads the bookmark button of *this* page (entities decoded, nothing executed)', () => {
    expect(metaFromHtml(html, '/bai-viet/x/')).toEqual({
      title: 'Ghi chép & “suy nghĩ”',
      cover: '/_astro/cover.AbCdEfGh.webp',
      category: 'doi-song',
      minutes: 5,
    });
    expect((window as unknown as { __ran?: boolean }).__ran).toBeUndefined();
  });

  it('falls back to <title> for other pages', () => {
    expect(metaFromHtml(html, '/thu-vien/').title).toBe('Ghi chép & suy nghĩ');
  });

  it('rejects unsafe cover URLs', () => {
    const evil = '<button data-bookmark data-url="/bai-viet/y/" data-title="Y" data-cover="javascript:alert(1)"></button>';
    expect(metaFromHtml(evil, '/bai-viet/y/').cover).toBe('');
  });
});

describe('buildOfflineList', () => {
  it('lists saved first (newest saved first), then visited by last read, then pages; skips /offline/', () => {
    const index = {
      saved: ['/bai-viet/a/', '/bai-viet/b/'],
      pages: ['/', '/bai-viet/c/', '/offline/', '/bai-viet/a/', '/thu-vien/', '/bai-viet/d/', '/bai-viet/e/'],
    };
    const metas: Record<string, PageMeta> = {
      '/thu-vien/': { title: 'Thư viện của bạn', cover: '', category: '', minutes: 0 },
      '/bai-viet/e/': { title: 'Bài E từ HTML', cover: '/covers/e.svg', category: 'ai', minutes: 3 },
    };
    const { articles, pages } = buildOfflineList(
      index,
      { bookmarks: [bm('a', 100), bm('b', 200)], history: [hi('c', 50), hi('d', 500, 0.95)] },
      (p) => metas[p],
    );
    expect(articles.map((a) => [a.path, a.saved])).toEqual([
      ['/bai-viet/b/', true],
      ['/bai-viet/a/', true],
      ['/bai-viet/d/', false],
      ['/bai-viet/c/', false],
      ['/bai-viet/e/', false],
    ]);
    expect(articles.find((a) => a.path === '/bai-viet/e/')).toMatchObject({ title: 'Bài E từ HTML', cover: '/covers/e.svg', minutes: 3, progress: null });
    expect(articles.find((a) => a.path === '/bai-viet/d/')?.progress).toBe(0.95);
    expect(pages).toEqual([
      { path: '/', title: 'Trang chủ' },
      { path: '/thu-vien/', title: 'Thư viện của bạn' },
    ]);
  });
});

describe('buildArticleRow', () => {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<li><article><div><img data-f="img"></div><p>
    <span data-f="cat"><span data-f="cat-name"></span></span>
    <span data-f="saved" hidden></span><span data-f="visited" hidden></span></p>
    <h3><a data-f="link"></a></h3><p><span data-f="minutes"></span><span data-f="progress"></span></p></article></li>`;

  it('fills text safely and shows the right pill', () => {
    const li = buildArticleRow(tpl, {
      path: '/bai-viet/x/',
      title: '<img src=x onerror=alert(1)>',
      cover: '',
      category: 'khong-co',
      minutes: 6,
      saved: false,
      progress: 0.5,
      time: 1,
    });
    const link = li.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/bai-viet/x/');
    expect(link.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(li.querySelectorAll('img').length).toBe(0); // no cover → no <img>, and the title is text
    expect(li.querySelector('[data-f="cat"]')).toBeNull();
    expect(li.querySelector<HTMLElement>('[data-f="saved"]')!.hidden).toBe(true);
    expect(li.querySelector<HTMLElement>('[data-f="visited"]')!.hidden).toBe(false);
    expect(li.querySelector('[data-f="minutes"]')!.textContent).toBe('6 phút đọc');
    expect(li.querySelector('[data-f="progress"]')!.textContent).toBe('Đã đọc 50%');
  });
});
