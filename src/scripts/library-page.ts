/**
 * /thu-vien/ — renders the personal library from localStorage into the static shell of
 * src/pages/thu-vien/index.astro. DOM is built by cloning <template>s and filling textContent /
 * attributes only (never innerHTML with stored strings). Safe to call when the DOM is absent.
 */
import {
  getBookmarks,
  getHistory,
  toEntries,
  sortEntries,
  remainingMinutes,
  removeBookmark,
  removeHistory,
  restoreBookmark,
  restoreHistory,
  removeHistoryWhere,
  restoreMany,
  clearAll,
  finished,
  FINISHED,
  exportLibrary,
  exportFileName,
  parseLibraryFile,
  importLibrary,
  safePath,
  type Bookmark,
  type HistoryItem,
  type LibraryEntry,
  type LibraryKind,
  type SortOrder,
} from './library-store';
import { CATEGORIES } from '../config';
import { timeAgo } from '../lib/date';
import { toast } from './share';
import { getRegistration, offlineIndex, onSWMessage, postToSW, syncSaved } from './library-offline';

export const KINDS: LibraryKind[] = ['saved', 'reading', 'done'];
const HASH: Record<LibraryKind, string> = { saved: 'da-luu', reading: 'dang-doc', done: 'da-doc' };
const UNDO_MS = 8000;

const CAT = new Map(CATEGORIES.map((c) => [c.id as string, c]));

/** "Đã lưu 3 ngày trước" · "Đọc hôm qua" · "Đọc xong 2 giờ trước" (natural wording for "vừa xong"). */
export function timeLabel(entry: Pick<LibraryEntry, 'kind' | 'time'>, now: Date = new Date()): string {
  const ago = timeAgo(new Date(entry.time), now);
  if (entry.kind === 'saved') return `Đã lưu ${ago}`;
  if (entry.kind === 'done') return ago === 'vừa xong' ? 'Vừa đọc xong' : `Đọc xong ${ago}`;
  return ago === 'vừa xong' ? 'Vừa đọc' : `Đọc ${ago}`;
}

export function progressLabel(minutes: number, progress: number): string {
  const left = remainingMinutes(minutes, progress);
  if (progress < 0.05) return `Mới bắt đầu · còn ~${left} phút`;
  return `Đã đọc ${Math.round(progress * 100)}% · còn ~${left} phút`;
}

const q = <T extends Element>(root: ParentNode, f: string) => root.querySelector<T>(`[data-f="${f}"]`);

/** Build one card <li> from the card template. Returns null for entries with an unsafe URL. */
export function buildCard(tpl: HTMLTemplateElement, entry: LibraryEntry, opts: { now?: Date; offline?: boolean } = {}): HTMLLIElement | null {
  const url = safePath(entry.url);
  if (!url) return null;
  const li = (tpl.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
  li.dataset.key = `${entry.kind}:${entry.id}`;
  li.dataset.url = url;

  const cat = CAT.get(entry.category);
  const card = li.querySelector<HTMLElement>('.lib-card');
  if (cat && card) card.style.setProperty('--c', cat.color);

  const catEl = q<HTMLElement>(li, 'cat');
  if (cat) q(li, 'cat-name')!.textContent = cat.name;
  else catEl?.remove();

  const time = q<HTMLTimeElement>(li, 'time')!;
  time.textContent = timeLabel(entry, opts.now);
  if (Number.isFinite(entry.time) && entry.time > 0) time.dateTime = new Date(entry.time).toISOString();

  const link = q<HTMLAnchorElement>(li, 'link')!;
  link.href = url;
  link.textContent = entry.title || 'Bài viết không tên';

  const img = q<HTMLImageElement>(li, 'img')!;
  const cover = safePath(entry.cover);
  if (cover) {
    img.src = cover;
    img.addEventListener('error', () => img.remove(), { once: true });
  } else img.remove();

  const desc = q<HTMLElement>(li, 'desc')!;
  if (entry.kind === 'saved' && entry.description) desc.textContent = entry.description;
  else desc.remove();

  const showProgress = entry.kind === 'reading' || (entry.kind === 'saved' && entry.progress != null && entry.progress < FINISHED);
  const prog = q<HTMLElement>(li, 'progress')!;
  if (showProgress && entry.progress != null) {
    prog.hidden = false;
    const pct = Math.round(Math.min(1, Math.max(0, entry.progress)) * 100);
    q<HTMLElement>(li, 'bar')!.style.width = `${pct}%`;
    q(li, 'progress-text')!.textContent = progressLabel(entry.minutes, entry.progress);
    prog.setAttribute('role', 'img');
    prog.setAttribute('aria-label', `Tiến độ đọc ${pct}%`);
  } else prog.remove();

  const isDone = entry.kind === 'done' || (entry.kind === 'saved' && entry.progress != null && entry.progress >= FINISHED);
  q<HTMLElement>(li, 'done')!.hidden = !isDone;
  q(li, 'minutes-text')!.textContent = `${Math.max(1, Math.round(entry.minutes || 1))} phút đọc`;
  q<HTMLElement>(li, 'offline')!.hidden = !opts.offline;

  const remove = q<HTMLButtonElement>(li, 'remove')!;
  remove.dataset.remove = li.dataset.key;
  const label =
    entry.kind === 'saved' ? `Bỏ “${entry.title}” khỏi danh sách đã lưu` : `Xoá “${entry.title}” khỏi lịch sử đọc`;
  remove.setAttribute('aria-label', label);
  remove.title = entry.kind === 'saved' ? 'Bỏ lưu' : 'Xoá khỏi lịch sử';
  return li;
}

export function buildUndoRow(tpl: HTMLTemplateElement, entry: LibraryEntry): HTMLLIElement {
  const li = (tpl.content.firstElementChild as HTMLLIElement).cloneNode(true) as HTMLLIElement;
  li.dataset.key = `${entry.kind}:${entry.id}`;
  q(li, 'msg')!.textContent =
    entry.kind === 'saved' ? `Đã bỏ “${entry.title}” khỏi thư viện.` : `Đã xoá “${entry.title}” khỏi lịch sử.`;
  const btn = q<HTMLButtonElement>(li, 'undo')!;
  btn.dataset.undo = li.dataset.key;
  btn.setAttribute('aria-label', `Hoàn tác: đưa “${entry.title}” trở lại`);
  return li;
}

interface Ghost {
  entry: LibraryEntry;
  raw: Bookmark | HistoryItem;
  timer: ReturnType<typeof setTimeout>;
}

export function initLibraryPage(doc: Document = document): void {
  const root = doc.querySelector<HTMLElement>('[data-library]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';

  const tplCard = root.querySelector<HTMLTemplateElement>('template[data-tpl="card"]')!;
  const tplUndo = root.querySelector<HTMLTemplateElement>('template[data-tpl="undo"]')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"][data-tab]')];
  const panels = new Map(KINDS.map((k) => [k, root.querySelector<HTMLElement>(`[data-panel="${k}"]`)!]));
  const tools = root.querySelector<HTMLElement>('[data-lib-tools]')!;
  const total = root.querySelector<HTMLElement>('[data-lib-total]')!;
  const sortSel = root.querySelector<HTMLSelectElement>('[data-lib-sort]')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-lib-clear]')!;
  const live = root.querySelector<HTMLElement>('[data-lib-live]')!;
  const dialog = root.querySelector<HTMLDialogElement>('[data-lib-confirm]')!;
  const offlineCard = root.querySelector<HTMLElement>('[data-offline-card]');
  const offlineCount = root.querySelector<HTMLElement>('[data-offline-count]');

  let active: LibraryKind = 'saved';
  let order: SortOrder = 'newest';
  let offline = new Set<string>();
  let swActive = false;
  let muted = false;
  const ghosts = new Map<string, Ghost>();
  const bulk = new Map<LibraryKind, { items: Bookmark[] | HistoryItem[]; timer: ReturnType<typeof setTimeout> }>();

  const announce = (msg: string) => {
    live.textContent = '';
    // New text node on the next frame so screen readers re-announce identical messages.
    requestAnimationFrame(() => (live.textContent = msg));
  };
  /** Run a store mutation without reacting to our own `ns:bookmarks-changed` event. */
  const quiet = (fn: () => void) => {
    muted = true;
    try {
      fn();
    } finally {
      muted = false;
    }
  };

  const data = () => toEntries(getBookmarks(), getHistory());

  // ---------- Rendering ----------
  function renderPanel(kind: LibraryKind, entries: LibraryEntry[]) {
    const panel = panels.get(kind)!;
    const list = panel.querySelector<HTMLElement>('[data-list]')!;
    const empty = panel.querySelector<HTMLElement>('[data-empty]')!;
    const ghostEntries = [...ghosts.values()].filter((g) => g.entry.kind === kind).map((g) => g.entry);
    const ghostKeys = new Set(ghostEntries.map((e) => `${e.kind}:${e.id}`));
    const rows = sortEntries([...entries.filter((e) => !ghostKeys.has(`${e.kind}:${e.id}`)), ...ghostEntries], order);
    const now = new Date();
    const frag = doc.createDocumentFragment();
    for (const e of rows) {
      const key = `${e.kind}:${e.id}`;
      const li = ghostKeys.has(key) ? buildUndoRow(tplUndo, e) : buildCard(tplCard, e, { now, offline: offline.has(safePath(e.url)) });
      if (li) frag.append(li);
    }
    list.replaceChildren(frag);
    list.removeAttribute('aria-busy');
    empty.hidden = rows.length > 0;
  }

  function render() {
    const d = data();
    for (const k of KINDS) {
      renderPanel(k, d[k]);
      const c = root!.querySelector(`[data-count="${k}"]`);
      if (c) c.textContent = String(d[k].length);
    }
    updateTools(d);
    updateOfflineCard();
  }

  function updateTools(d = data()) {
    const n = d[active].length;
    tools.hidden = n === 0;
    total.textContent = `${n} bài`;
    sortSel.disabled = n < 2;
    tabs.forEach((t) => {
      const k = t.dataset.tab as LibraryKind;
      const count = d[k].length;
      t.setAttribute('aria-label', `${t.dataset.label}: ${count} bài`);
    });
  }

  function updateCounts() {
    const d = data();
    for (const k of KINDS) {
      const c = root!.querySelector(`[data-count="${k}"]`);
      if (c) c.textContent = String(d[k].length);
    }
    updateTools(d);
  }

  function applyOffline() {
    root!.querySelectorAll<HTMLElement>('li[data-url]').forEach((li) => {
      const badge = li.querySelector<HTMLElement>('[data-f="offline"]');
      if (badge) badge.hidden = !offline.has(li.dataset.url!);
    });
    updateOfflineCard();
  }

  function updateOfflineCard() {
    if (!offlineCard || !offlineCount) return;
    offlineCard.hidden = !swActive;
    if (!swActive) return;
    const saved = getBookmarks();
    const ready = saved.filter((b) => offline.has(safePath(b.url))).length;
    offlineCount.textContent = saved.length
      ? `${ready}/${saved.length} bài đã lưu sẵn sàng đọc offline.`
      : 'Lưu một bài bất kỳ, nó sẽ tự được tải về máy.';
  }

  async function refreshOffline() {
    const { saved, pages } = await offlineIndex();
    offline = new Set([...saved, ...pages]);
    applyOffline();
  }

  // ---------- Tabs ----------
  function select(kind: LibraryKind, { focus = false, updateHash = true } = {}) {
    active = kind;
    tabs.forEach((t) => {
      const on = t.dataset.tab === kind;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    panels.forEach((p, k) => (p.hidden = k !== kind));
    if (updateHash && location.hash !== `#${HASH[kind]}`) history.replaceState(null, '', `#${HASH[kind]}`);
    updateTools();
  }

  tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.tab as LibraryKind)));
  root.querySelector('[role="tablist"]')?.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const i = tabs.findIndex((t) => t.dataset.tab === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next].dataset.tab as LibraryKind, { focus: true });
  });

  function kindFromHash(): LibraryKind | null {
    const h = location.hash.slice(1);
    return (KINDS.find((k) => HASH[k] === h) as LibraryKind | undefined) ?? null;
  }
  addEventListener('hashchange', () => {
    const k = kindFromHash();
    if (k && k !== active) select(k, { updateHash: false });
  });

  // ---------- Remove + undo ----------
  function focusAfter(li: Element | null) {
    const next = li?.nextElementSibling ?? li?.previousElementSibling;
    const target = next?.querySelector<HTMLElement>('.lib-link, [data-undo]');
    if (target) target.focus();
    else tabs.find((t) => t.dataset.tab === active)?.focus();
  }

  function dropRow(li: HTMLElement | null, after?: () => void) {
    if (!li) return after?.();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hadFocus = li.contains(doc.activeElement);
    const finish = () => {
      if (hadFocus) focusAfter(li);
      li.remove();
      after?.();
    };
    if (reduce) return finish();
    li.dataset.leaving = '';
    li.addEventListener('animationend', finish, { once: true });
    setTimeout(() => li.isConnected && finish(), 400);
  }

  function expire(key: string) {
    const g = ghosts.get(key);
    if (!g) return;
    clearTimeout(g.timer);
    ghosts.delete(key);
    const li = panels.get(g.entry.kind)!.querySelector<HTMLElement>(`li[data-key="${CSS.escape(key)}"]`);
    dropRow(li, () => {
      const panel = panels.get(g.entry.kind)!;
      if (!panel.querySelector('[data-list] > li')) render();
    });
  }

  function remove(key: string) {
    const [kind, ...rest] = key.split(':') as [LibraryKind, ...string[]];
    const id = rest.join(':');
    const entry = data()[kind].find((e) => e.id === id);
    if (!entry) return;
    let raw: Bookmark | HistoryItem | undefined;
    quiet(() => {
      if (kind === 'saved') {
        raw = getBookmarks().find((b) => b.id === id);
        removeBookmark(id);
      } else {
        raw = getHistory().find((h) => h.id === id);
        removeHistory(id);
      }
    });
    if (!raw) return;
    if (kind === 'saved') postToSW({ type: 'uncache-post', url: raw.url });
    navigator.vibrate?.(8);

    const timer = setTimeout(() => expire(key), UNDO_MS);
    ghosts.set(key, { entry, raw, timer });
    const li = panels.get(kind)!.querySelector<HTMLElement>(`li[data-key="${CSS.escape(key)}"]`);
    const row = buildUndoRow(tplUndo, entry);
    if (li) li.replaceWith(row);
    row.querySelector<HTMLElement>('[data-undo]')?.focus();
    announce(row.querySelector('[data-f="msg"]')?.textContent ?? '');
    updateCounts();
    if (kind === 'saved') updateOfflineCard();
  }

  function undo(key: string) {
    const g = ghosts.get(key);
    if (!g) return;
    clearTimeout(g.timer);
    ghosts.delete(key);
    quiet(() => {
      if (g.entry.kind === 'saved') restoreBookmark(g.raw as Bookmark);
      else restoreHistory(g.raw as HistoryItem);
    });
    if (g.entry.kind === 'saved') postToSW({ type: 'cache-post', url: g.raw.url, cover: g.raw.cover });
    render();
    panels.get(g.entry.kind)!.querySelector<HTMLElement>(`li[data-key="${CSS.escape(key)}"] .lib-link`)?.focus();
    announce(`Đã đưa “${g.entry.title}” trở lại.`);
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const rm = t.closest<HTMLElement>('[data-remove]');
    if (rm) {
      e.preventDefault();
      remove(rm.dataset.remove!);
      return;
    }
    const un = t.closest<HTMLElement>('[data-undo]');
    if (un) {
      e.preventDefault();
      undo(un.dataset.undo!);
    }
  });

  // ---------- Sort ----------
  sortSel.addEventListener('change', () => {
    order = sortSel.value === 'oldest' ? 'oldest' : 'newest';
    render();
    announce(order === 'oldest' ? 'Đã sắp xếp: cũ nhất trước.' : 'Đã sắp xếp: mới nhất trước.');
  });

  // ---------- Clear all (+ undo banner) ----------
  const CLEAR_COPY: Record<LibraryKind, { title: string; text: (n: number) => string; done: (n: number) => string }> = {
    saved: {
      title: 'Bỏ tất cả bài đã lưu?',
      text: (n) => `${n} bài sẽ bị bỏ khỏi thư viện trên trình duyệt này (kể cả bản đọc offline). Bạn vẫn có thể hoàn tác ngay sau đó.`,
      done: (n) => `Đã bỏ ${n} bài đã lưu.`,
    },
    reading: {
      title: 'Xoá danh sách đang đọc?',
      text: (n) => `${n} bài đang đọc dở sẽ bị xoá khỏi lịch sử, kèm vị trí bạn đã dừng. Bạn vẫn có thể hoàn tác ngay sau đó.`,
      done: (n) => `Đã xoá ${n} bài đang đọc.`,
    },
    done: {
      title: 'Xoá danh sách đã đọc?',
      text: (n) => `${n} bài đã đọc xong sẽ bị xoá khỏi lịch sử. Bạn vẫn có thể hoàn tác ngay sau đó.`,
      done: (n) => `Đã xoá ${n} bài đã đọc.`,
    },
  };

  function showBanner(kind: LibraryKind, text: string) {
    const banner = panels.get(kind)!.querySelector<HTMLElement>('[data-banner]')!;
    banner.querySelector('[data-banner-text]')!.textContent = text;
    banner.hidden = false;
    banner.querySelector<HTMLElement>('[data-banner-undo]')?.focus();
  }
  function hideBanner(kind: LibraryKind) {
    const b = bulk.get(kind);
    if (b) clearTimeout(b.timer);
    bulk.delete(kind);
    const banner = panels.get(kind)!.querySelector<HTMLElement>('[data-banner]')!;
    banner.hidden = true;
  }

  function clearKind(kind: LibraryKind) {
    // Pending single-item undos of this tab are superseded by the bulk undo.
    for (const [key, g] of ghosts) {
      if (g.entry.kind === kind) {
        clearTimeout(g.timer);
        ghosts.delete(key);
      }
    }
    let items: Bookmark[] | HistoryItem[] = [];
    quiet(() => {
      if (kind === 'saved') {
        items = getBookmarks();
        clearAll('bookmarks');
      } else {
        items = removeHistoryWhere((h) => (kind === 'done' ? finished(h) : !finished(h)));
      }
    });
    if (!items.length) return;
    if (kind === 'saved') syncSaved([]);
    hideBanner(kind);
    bulk.set(kind, { items, timer: setTimeout(() => hideBanner(kind), UNDO_MS * 2) });
    render();
    const msg = CLEAR_COPY[kind].done(items.length);
    showBanner(kind, msg);
    announce(msg);
  }

  KINDS.forEach((kind) => {
    panels
      .get(kind)!
      .querySelector('[data-banner-undo]')
      ?.addEventListener('click', () => {
        const b = bulk.get(kind);
        if (!b) return;
        quiet(() => restoreMany(kind === 'saved' ? 'bookmarks' : 'history', b.items));
        if (kind === 'saved') syncSaved(getBookmarks());
        hideBanner(kind);
        render();
        tabs.find((t) => t.dataset.tab === kind)?.focus();
        announce(`Đã khôi phục ${b.items.length} bài.`);
      });
  });

  clearBtn.addEventListener('click', () => {
    const n = data()[active].length;
    if (!n) return;
    const copy = CLEAR_COPY[active];
    dialog.querySelector('[data-confirm-title]')!.textContent = copy.title;
    dialog.querySelector('[data-confirm-text]')!.textContent = copy.text(n);
    dialog.returnValue = '';
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') clearKind(active);
    else clearBtn.focus();
  });
  // Click on the backdrop closes the sheet.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('cancel');
  });

  // ---------- Export / import ----------
  root.querySelector('[data-lib-export]')?.addEventListener('click', () => {
    const data = exportLibrary();
    if (!data.bookmarks.length && !data.history.length) {
      toast('Thư viện đang trống, chưa có gì để xuất.', { tone: 'info' });
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName();
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Đã xuất ${data.bookmarks.length} bài đã lưu và ${data.history.length} mục lịch sử.`);
  });

  const fileInput = root.querySelector<HTMLInputElement>('[data-lib-file]');
  root.querySelector('[data-lib-import]')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 2_000_000) {
      toast('File quá lớn — có vẻ đây không phải file thư viện của blog Gì thế nhỉ.', { tone: 'error' });
      return;
    }
    try {
      const parsed = parseLibraryFile(await file.text());
      let res = { bookmarks: 0, history: 0 };
      quiet(() => (res = importLibrary(parsed)));
      render();
      syncSaved(getBookmarks());
      if (!res.bookmarks && !res.history) toast('Không có gì mới — thư viện đã có đủ các bài trong file này.', { tone: 'info' });
      else toast(`Đã nhập ${res.bookmarks} bài đã lưu và ${res.history} mục lịch sử.`);
    } catch (err) {
      toast(`${(err as Error).message} Bạn thử lại với file đã xuất từ trang Thư viện nhé.`, { tone: 'error', duration: 5000 });
    }
  });

  // ---------- External changes (other tabs, keyboard shortcut, import) ----------
  doc.addEventListener('ns:bookmarks-changed', () => {
    if (!muted) render();
  });
  addEventListener('storage', (e) => {
    if (e.key === 'ns:bookmarks' || e.key === 'ns:history') render();
  });

  // ---------- Service worker: offline badges ----------
  onSWMessage((msg) => {
    if (msg.type === 'post-cached' || msg.type === 'post-uncached' || msg.type === 'saved-synced') refreshOffline();
  });

  // ---------- Boot ----------
  const d = data();
  const initial = kindFromHash() ?? (d.saved.length ? 'saved' : d.reading.length ? 'reading' : d.done.length ? 'done' : 'saved');
  render();
  select(initial, { updateHash: false });
  refreshOffline();
  getRegistration().then((reg) => {
    swActive = !!reg?.active;
    updateOfflineCard();
    // Bookmarks made before the service worker existed (or on another tab) get their offline copy now.
    if (swActive) syncSaved(getBookmarks());
  });
}
