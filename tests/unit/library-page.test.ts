// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildCard, buildUndoRow, timeLabel, progressLabel, initLibraryPage } from '../../src/scripts/library-page';
import { getBookmarks, type LibraryEntry } from '../../src/scripts/library-store';

const CARD_TPL = `
<template data-tpl="card">
  <li class="lib-item"><article class="lib-card">
    <div class="lib-thumb" data-f="thumb"><img alt="" data-f="img"></div>
    <div class="lib-body">
      <p class="lib-meta"><span class="lib-cat" data-f="cat"><span data-f="cat-name"></span></span><time data-f="time"></time></p>
      <h3><a class="lib-link" data-f="link"></a></h3>
      <p data-f="desc"></p>
      <div data-f="progress" hidden><div><span data-f="bar"></span></div><p data-f="progress-text"></p></div>
    </div>
    <div class="lib-foot">
      <span data-f="minutes"><span data-f="minutes-text"></span></span>
      <span data-f="done" hidden></span>
      <span data-f="offline" hidden></span>
      <button type="button" data-f="remove"></button>
    </div>
  </article></li>
</template>
<template data-tpl="undo">
  <li class="lib-item"><div><p data-f="msg"></p><button type="button" data-f="undo"></button></div></li>
</template>`;

const PAGE = `
<div data-library>
  <div role="tablist">
    <button role="tab" data-tab="saved" data-label="Đã lưu"><span data-count="saved"></span></button>
    <button role="tab" data-tab="reading" data-label="Đang đọc"><span data-count="reading"></span></button>
    <button role="tab" data-tab="done" data-label="Đã đọc"><span data-count="done"></span></button>
  </div>
  <div data-lib-tools hidden><p data-lib-total></p><select data-lib-sort><option value="newest">x</option><option value="oldest">y</option></select><button data-lib-clear></button></div>
  ${['saved', 'reading', 'done']
    .map(
      (k) => `<div role="tabpanel" data-panel="${k}"><div data-banner hidden><p data-banner-text></p><button data-banner-undo></button></div><ul data-list></ul><div data-empty="${k}" hidden></div></div>`,
    )
    .join('')}
  <p data-lib-live></p>
  <dialog data-lib-confirm><h2 data-confirm-title></h2><p data-confirm-text></p></dialog>
  ${CARD_TPL}
</div>`;

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  kind: 'saved',
  id: 'a',
  title: 'Tiêu đề',
  url: '/bai-viet/a/',
  cover: '/covers/a.svg',
  category: 'ai',
  minutes: 10,
  description: 'Mô tả ngắn',
  time: Date.UTC(2026, 10, 8),
  progress: null,
  ...over,
});

function tpl(name: string) {
  document.body.innerHTML = CARD_TPL;
  return document.querySelector<HTMLTemplateElement>(`template[data-tpl="${name}"]`)!;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  location.hash = '';
});

describe('labels', () => {
  const now = new Date(Date.UTC(2026, 10, 9, 12));
  it('timeLabel per tab', () => {
    expect(timeLabel({ kind: 'saved', time: now.getTime() - 3 * 86400e3 }, now)).toBe('Đã lưu 3 ngày trước');
    expect(timeLabel({ kind: 'reading', time: now.getTime() - 10e3 }, now)).toBe('Vừa đọc');
    expect(timeLabel({ kind: 'done', time: now.getTime() - 10e3 }, now)).toBe('Vừa đọc xong');
    expect(timeLabel({ kind: 'done', time: now.getTime() - 2 * 3600e3 }, now)).toBe('Đọc xong 2 giờ trước');
  });
  it('progressLabel', () => {
    expect(progressLabel(10, 0.45)).toBe('Đã đọc 45% · còn ~6 phút');
    expect(progressLabel(10, 0.01)).toBe('Mới bắt đầu · còn ~10 phút');
  });
});

describe('buildCard', () => {
  it('renders stored strings as text, never as markup', () => {
    const li = buildCard(tpl('card'), entry({ title: '<img src=x onerror=alert(1)>' }))!;
    const link = li.querySelector('a')!;
    expect(link.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(li.querySelectorAll('img').length).toBe(1); // only the cover
    expect(link.getAttribute('href')).toBe('/bai-viet/a/');
    expect(li.querySelector('[data-f="remove"]')!.getAttribute('aria-label')).toContain('khỏi danh sách đã lưu');
  });
  it('drops entries with unsafe urls and unsafe covers', () => {
    expect(buildCard(tpl('card'), entry({ url: 'javascript:alert(1)' }))).toBeNull();
    const li = buildCard(tpl('card'), entry({ cover: 'https://evil.example/x.png' }))!;
    expect(li.querySelector('img')).toBeNull();
  });
  it('shows progress for reading items and the offline badge when cached', () => {
    const li = buildCard(tpl('card'), entry({ kind: 'reading', progress: 0.5, description: '' }), { offline: true })!;
    expect(li.querySelector<HTMLElement>('[data-f="progress"]')!.hidden).toBe(false);
    expect(li.querySelector<HTMLElement>('[data-f="bar"]')!.style.width).toBe('50%');
    expect(li.querySelector<HTMLElement>('[data-f="offline"]')!.hidden).toBe(false);
    expect(li.querySelector('[data-f="desc"]')).toBeNull();
  });
  it('marks finished items', () => {
    const li = buildCard(tpl('card'), entry({ kind: 'done', progress: 1 }))!;
    expect(li.querySelector<HTMLElement>('[data-f="done"]')!.hidden).toBe(false);
    expect(li.querySelector('[data-f="progress"]')).toBeNull();
  });
  it('undo row', () => {
    const li = buildUndoRow(tpl('undo'), entry({ title: 'X' }));
    expect(li.textContent).toContain('Đã bỏ “X” khỏi thư viện.');
    expect(li.querySelector<HTMLElement>('[data-undo]')!.dataset.undo).toBe('saved:a');
  });
});

describe('initLibraryPage', () => {
  const bm = (id: string, savedAt: number) => ({
    id,
    title: `Bài ${id}`,
    url: `/bai-viet/${id}/`,
    description: '',
    category: 'ai',
    minutes: 5,
    cover: '',
    date: '',
    savedAt,
  });

  it('is a no-op without the page shell', () => {
    expect(() => initLibraryPage()).not.toThrow();
  });

  it('renders counts, removes with undo, and restores', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    localStorage.setItem('ns:bookmarks', JSON.stringify([bm('b', 20), bm('a', 10)]));
    document.body.innerHTML = PAGE;
    initLibraryPage();

    const list = document.querySelector('[data-panel="saved"] [data-list]')!;
    expect(document.querySelector('[data-count="saved"]')!.textContent).toBe('2');
    expect([...list.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Bài b', 'Bài a']);
    expect(document.querySelector<HTMLElement>('[data-empty="saved"]')!.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-lib-tools]')!.hidden).toBe(false);

    // Remove "b" → undo row in place, storage updated, count updated.
    list.querySelector<HTMLButtonElement>('[data-remove="saved:b"]')!.click();
    expect(getBookmarks().map((b) => b.id)).toEqual(['a']);
    expect(list.querySelector('[data-undo="saved:b"]')).not.toBeNull();
    expect(document.querySelector('[data-count="saved"]')!.textContent).toBe('1');

    // Undo → back in place with its original savedAt.
    list.querySelector<HTMLButtonElement>('[data-undo="saved:b"]')!.click();
    expect(getBookmarks().map((b) => [b.id, b.savedAt])).toEqual([
      ['b', 20],
      ['a', 10],
    ]);
    expect([...list.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Bài b', 'Bài a']);

    // Sort oldest first.
    const sel = document.querySelector<HTMLSelectElement>('[data-lib-sort]')!;
    sel.value = 'oldest';
    sel.dispatchEvent(new Event('change'));
    expect([...list.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Bài a', 'Bài b']);
    vi.useRealTimers();
  });

  it('opens the tab from the URL hash and shows the empty state', () => {
    location.hash = '#da-doc';
    document.body.innerHTML = PAGE;
    initLibraryPage();
    expect(document.querySelector('[data-tab="done"]')!.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector<HTMLElement>('[data-panel="saved"]')!.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-empty="done"]')!.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-lib-tools]')!.hidden).toBe(true);
  });
});
