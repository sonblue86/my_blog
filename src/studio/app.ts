/**
 * Controller of the writing studio (/viet-bai/). Views: login → list → editor.
 * Routes (hash, so a refresh keeps you where you were): #/  ·  #/new  ·  #/edit/<slug>
 *
 * Security notes: every string that came from GitHub, the editor or the AI is put in the DOM with
 * textContent / attributes — never innerHTML — except the Markdown preview, which is rendered by
 * markdown-it with raw HTML disabled (src/studio/preview.ts).
 */
import { BLOCKS } from '../lib/blocks';
import { initTheme, toggleTheme } from '../scripts/theme';
import { aiAvailable, aiMeta, aiStream, type AiRequest } from './ai-client';
import { openBlockForm } from './block-form';
import { createEditor, type BlockRef, type Range, type StudioEditor } from './editor';
import { GitHub, GitHubError } from './github';
import { mimeFromName, prepareImage, type PendingImage } from './images';
import {
  CATEGORIES,
  POSTS_DIR,
  emptyMeta,
  isValidSlug,
  normalizeRel,
  parsePostFile,
  parseTags,
  postPath,
  postsFromTree,
  relativeImageRefs,
  serializePostFile,
  slugify,
  todayIn,
  validatePost,
  type PostEntry,
  type PostMeta,
} from './post-file';
import { readingMinutes, renderMarkdown, wordCount } from './preview';
import { clearLocalDraft, clearToken, loadLocalDraft, loadToken, saveLocalDraft, saveToken, type LocalDraft } from './session';

/* ------------------------------------------------------------------ dom */

const body = document.body;
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function toast(message: string, tone: 'ok' | 'info' | 'error' = 'ok', action?: { label: string; href: string }) {
  document.dispatchEvent(new CustomEvent('ns:toast', { detail: { message, tone, action } }));
}

const errorMessage = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Có lỗi xảy ra, bạn thử lại nhé.');

function confirmDialog(opts: { title: string; text: string; ok: string; danger?: boolean }): Promise<boolean> {
  const dialog = $<HTMLDialogElement>('[data-dialog]');
  $('[data-dialog-title]', dialog).textContent = opts.title;
  $('[data-dialog-text]', dialog).textContent = opts.text;
  const ok = $('[data-dialog-ok]', dialog);
  ok.textContent = opts.ok;
  ok.dataset.danger = String(opts.danger === true);
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name])) as Record<string, string>;
const dateFmt = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
const formatDate = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : dateFmt.format(t);
};

/* ---------------------------------------------------------------- state */

const repo = { repo: body.dataset.repo!, branch: body.dataset.branch || 'main' };
let token = '';
let gh: GitHub | null = null;

type Status = 'draft' | 'scheduled' | 'published';
interface Row {
  entry: PostEntry;
  meta?: PostMeta;
}
let rows: Row[] = [];
let filter: 'all' | Status = 'all';

interface Doc {
  isNew: boolean;
  /** Slug on GitHub (existing posts) — the folder name. New posts read it from the slug field. */
  slug: string;
  entry?: PostEntry;
  meta: PostMeta;
  extra: Record<string, unknown>;
  /** pubDate/updatedDate exactly as in the file, so an untouched full timestamp is written back as is. */
  origDates: { pubDate: string; updatedDate?: string };
  /** Was the post live (draft: false) when it was opened / last saved? */
  wasPublished: boolean;
  pending: Map<string, PendingImage>;
  slugTouched: boolean;
  dirty: boolean;
}
let doc: Doc | null = null;
let editor: StudioEditor | null = null;
let markdown = '';
let busy = false;

const statusOf = (meta: PostMeta): Status => (meta.draft ? 'draft' : Date.parse(meta.pubDate) > Date.now() ? 'scheduled' : 'published');
const STATUS_LABEL: Record<Status, string> = { draft: 'Nháp', scheduled: 'Hẹn giờ', published: 'Đã đăng' };

/* ----------------------------------------------------------------- views */

function show(view: 'boot' | 'login' | 'list' | 'editor') {
  body.dataset.view = view;
  window.scrollTo(0, 0);
}

function route() {
  if (!gh) return show('login');
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'new') return void openNew();
  const m = /^edit\/([a-z0-9-]+)$/.exec(hash);
  if (m) return void openPost(m[1]!);
  void showList();
}

function go(hash: string) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* ----------------------------------------------------------------- login */

async function signIn(candidate: string, remember: boolean | null): Promise<void> {
  const client = new GitHub(candidate, repo);
  const { canPush } = await client.verify();
  if (!canPush) throw new GitHubError(403, 'Token này chỉ đọc được repo. Hãy cấp quyền Contents: Read and write rồi thử lại.');
  token = candidate;
  gh = client;
  if (remember !== null) saveToken(candidate, remember);
  body.dataset.auth = 'true';
}

function signOut() {
  clearToken();
  token = '';
  gh = null;
  rows = [];
  delete body.dataset.auth;
  history.replaceState(null, '', location.pathname);
  show('login');
}

$<HTMLFormElement>('[data-form="login"]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  const input = form.elements.namedItem('token') as HTMLInputElement;
  const remember = (form.elements.namedItem('remember') as HTMLInputElement).checked;
  const error = $('[data-login-error]');
  const submit = $<HTMLButtonElement>('button[type="submit"]', form);
  const value = input.value.trim();
  error.hidden = true;
  if (!value) {
    error.textContent = 'Bạn dán token GitHub vào ô trên nhé.';
    error.hidden = false;
    return;
  }
  submit.disabled = true;
  submit.textContent = 'Đang kiểm tra…';
  try {
    await signIn(value, remember);
    input.value = '';
    route();
  } catch (err) {
    error.textContent = errorMessage(err);
    error.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Đăng nhập';
  }
});

/* ------------------------------------------------------------------ list */

const metaCacheKey = (sha: string) => `ns-studio:meta:${sha}`;

async function loadMeta(row: Row): Promise<void> {
  try {
    const cached = sessionStorage.getItem(metaCacheKey(row.entry.sha));
    if (cached) {
      row.meta = JSON.parse(cached) as PostMeta;
      return;
    }
  } catch {
    /* ignore */
  }
  row.meta = parsePostFile(await gh!.readText(row.entry.sha)).meta;
  try {
    sessionStorage.setItem(metaCacheKey(row.entry.sha), JSON.stringify(row.meta));
  } catch {
    /* ignore */
  }
}

async function refreshRows(): Promise<void> {
  const { entries } = await gh!.listTree(POSTS_DIR);
  const known = new Map(rows.map((r) => [r.entry.sha, r.meta]));
  rows = postsFromTree(entries).map((entry) => ({ entry, meta: known.get(entry.sha) }));
  renderRows();
  // Titles and statuses arrive a few at a time; the list is usable meanwhile.
  const queue = rows.filter((r) => !r.meta);
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        await loadMeta(row).catch(() => undefined);
        renderRows();
      }
    }),
  );
}

function renderRows() {
  const list = $('[data-rows]');
  const q = slugify($<HTMLInputElement>('[data-list-search]').value, 200);
  const sorted = [...rows].sort((a, b) => (Date.parse(b.meta?.pubDate ?? '') || 0) - (Date.parse(a.meta?.pubDate ?? '') || 0));
  const visible = sorted.filter((r) => {
    if (filter !== 'all' && (!r.meta || statusOf(r.meta) !== filter)) return false;
    return !q || slugify(`${r.meta?.title ?? ''} ${r.entry.slug}`, 400).includes(q);
  });

  list.replaceChildren(
    ...visible.map((r) => {
      const status = r.meta ? statusOf(r.meta) : null;
      const title = r.meta ? el('span', { class: 'st-rowtitle', text: r.meta.title || r.entry.slug }) : el('span', { class: 'st-skeleton' });
      const metaLine = el('span', { class: 'st-rowmeta' });
      if (status) metaLine.append(el('span', { class: 'st-badge', 'data-tone': status, text: STATUS_LABEL[status] }));
      if (r.entry.format === 'mdx') metaLine.append(el('span', { class: 'st-badge', text: 'MDX', title: 'Bài có component tương tác' }));
      if (r.meta) metaLine.append(`${CATEGORY_NAME[r.meta.category] ?? ''} · ${formatDate(r.meta.pubDate)}`);
      if (loadLocalDraft(r.entry.slug)) metaLine.append(el('span', { class: 'st-badge', 'data-tone': 'scheduled', text: 'Đang sửa dở' }));

      const main =
        r.entry.format === 'mdx'
          ? el('a', { class: 'st-rowmain', href: `https://github.com/${repo.repo}/edit/${repo.branch}/${r.entry.path}`, target: '_blank', rel: 'noopener noreferrer', title: 'Bài MDX có component tương tác — sửa trực tiếp trên GitHub' }, title, metaLine)
          : el('a', { class: 'st-rowmain', href: `#/edit/${r.entry.slug}` }, title, metaLine);

      const actions = el('span', { class: 'st-rowactions' });
      if (status === 'published') {
        const view = el('a', { class: 'btn-icon', href: `/bai-viet/${r.entry.slug}/`, target: '_blank', rel: 'noopener', 'aria-label': 'Xem bài trên blog', title: 'Xem bài trên blog' });
        view.append(iconClone('external-link'));
        actions.append(view);
      }
      return el('li', { class: 'st-rowitem' }, main, actions);
    }),
  );
  $('[data-list-empty]').hidden = visible.length > 0;
  $('[data-list-count]').textContent = `${rows.length} bài · ${rows.filter((r) => r.meta && statusOf(r.meta) === 'draft').length} bản nháp`;

  const localNew = loadLocalDraft('new');
  $('[data-local-new]').hidden = !localNew;
  if (localNew) $('[data-local-new-title]').textContent = localNew.meta.title || '(chưa có tiêu đề)';
}

/** Reuse an icon already rendered on the page (icons are build-time SVG, there is no JS icon set). */
function iconClone(name: 'external-link'): Node {
  const tpl = $<HTMLTemplateElement>(`template[data-icon="${name}"]`);
  return tpl.content.cloneNode(true);
}

async function showList() {
  await closeEditor();
  show('list');
  try {
    await refreshRows();
  } catch (err) {
    if (err instanceof GitHubError && err.status === 401) {
      toast(err.message, 'error');
      return signOut();
    }
    toast(errorMessage(err), 'error');
  }
}

$$('[data-filter]').forEach((btn) =>
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter as typeof filter;
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderRows();
  }),
);
$('[data-list-search]').addEventListener('input', renderRows);

/* ---------------------------------------------------------------- editor */

const F = {
  title: () => $<HTMLTextAreaElement>('[data-f="title"]'),
  description: () => $<HTMLTextAreaElement>('[data-f="description"]'),
  slug: () => $<HTMLInputElement>('[data-f="slug"]'),
  category: () => $<HTMLSelectElement>('[data-f="category"]'),
  tags: () => $<HTMLInputElement>('[data-f="tags"]'),
  pubDate: () => $<HTMLInputElement>('[data-f="pubDate"]'),
  updatedDate: () => $<HTMLInputElement>('[data-f="updatedDate"]'),
  coverAlt: () => $<HTMLInputElement>('[data-f="coverAlt"]'),
  summary: () => $<HTMLTextAreaElement>('[data-f="summary"]'),
  takeaways: () => $<HTMLTextAreaElement>('[data-f="takeaways"]'),
  series: () => $<HTMLInputElement>('[data-f="series"]'),
  seriesOrder: () => $<HTMLInputElement>('[data-f="seriesOrder"]'),
  featured: () => $<HTMLInputElement>('[data-f="featured"]'),
  comments: () => $<HTMLInputElement>('[data-f="comments"]'),
};

function autoGrow(area: HTMLTextAreaElement) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight}px`;
}

const growFields = () => [F.title(), F.description()].forEach(autoGrow);
window.addEventListener('resize', growFields);

function fillForm(d: Doc) {
  const m = d.meta;
  F.title().value = m.title;
  F.description().value = m.description;
  F.slug().value = d.slug;
  F.category().value = m.category;
  F.tags().value = m.tags.join(', ');
  F.pubDate().value = m.pubDate.slice(0, 10);
  F.updatedDate().value = (m.updatedDate ?? '').slice(0, 10);
  F.coverAlt().value = m.coverAlt ?? '';
  F.summary().value = m.summary ?? '';
  F.takeaways().value = (m.takeaways ?? []).join('\n');
  F.series().value = m.series ?? '';
  F.seriesOrder().value = m.seriesOrder ? String(m.seriesOrder) : '';
  F.featured().checked = m.featured;
  F.comments().checked = m.comments;
  $('[data-slug-field]').hidden = !d.isNew;
  $('[data-action="delete"]').hidden = d.isNew;
  syncDerived();
  void syncCover();
}

/** Keep a full timestamp from the file when the day was not changed in the date picker. */
const keepTime = (picked: string, original?: string) => (original && original.slice(0, 10) === picked ? original : picked);

function readForm(d: Doc): PostMeta {
  const takeaways = F.takeaways().value.split('\n').map((s) => s.replace(/^[-*•\s]+/, '').trim()).filter(Boolean);
  const order = Number.parseInt(F.seriesOrder().value, 10);
  const updated = F.updatedDate().value;
  return {
    ...d.meta,
    title: F.title().value.replace(/\s+/g, ' ').trim(),
    description: F.description().value.replace(/\s+/g, ' ').trim(),
    category: F.category().value as PostMeta['category'],
    tags: parseTags(F.tags().value),
    pubDate: keepTime(F.pubDate().value, d.origDates.pubDate),
    updatedDate: updated ? keepTime(updated, d.origDates.updatedDate) : undefined,
    coverAlt: F.coverAlt().value.trim() || undefined,
    summary: F.summary().value.trim() || undefined,
    takeaways: takeaways.length ? takeaways : undefined,
    series: F.series().value.trim() || undefined,
    seriesOrder: Number.isInteger(order) && order > 0 ? order : undefined,
    featured: F.featured().checked,
    comments: F.comments().checked,
  };
}

function currentSlug(d: Doc): string {
  return d.isNew ? F.slug().value.trim() : d.slug;
}

function syncDerived() {
  if (!doc) return;
  const desc = F.description().value.trim().length;
  const counter = $('[data-desc-count]');
  counter.textContent = `${desc}/300`;
  counter.dataset.over = String(desc > 300);
  $('[data-slug-hint]').textContent = `/bai-viet/${currentSlug(doc) || '…'}/`;
  const picked = F.pubDate().value;
  $('[data-date-hint]').textContent =
    picked && picked > todayIn() ? 'Ngày đăng ở tương lai: bài được hẹn giờ và tự lên trang vào sáng hôm đó (cần bật lịch deploy hằng ngày).' : '';
  const words = wordCount(markdown);
  $('[data-word-count]').textContent = words ? `${words.toLocaleString('vi-VN')} từ · khoảng ${readingMinutes(markdown)} phút đọc` : '';
  $('[data-draft-label]').textContent = doc.wasPublished ? 'Gỡ về nháp' : 'Lưu nháp';
  $('[data-publish-label]').textContent = doc.wasPublished ? 'Cập nhật' : 'Đăng bài';
}

function setStatus(state: 'saved' | 'dirty' | 'saving' | 'error', text: string) {
  const node = $('[data-status]');
  node.dataset.state = state;
  $('[data-status-text]').textContent = text;
}

let autosave = 0;
function markDirty() {
  if (!doc) return;
  doc.dirty = true;
  setStatus('dirty', 'Chưa lưu lên blog');
  clearTimeout(autosave);
  autosave = window.setTimeout(flushLocal, 700);
}

function localId(d: Doc) {
  return d.isNew ? 'new' : d.slug;
}

function flushLocal() {
  clearTimeout(autosave);
  if (!doc || !doc.dirty) return;
  const draft: LocalDraft = {
    slug: currentSlug(doc),
    isNew: doc.isNew,
    meta: readForm(doc),
    body: markdown,
    baseSha: doc.entry?.sha,
    savedAt: Date.now(),
  };
  saveLocalDraft(localId(doc), draft);
  setStatus('dirty', 'Chưa lưu lên blog · đã giữ bản nháp trên máy này');
}

/* -- images -- */

const blobUrlBySha = new Map<string, string>();

/** Markdown image URL → something the browser can show. Local images come from memory or from GitHub. */
async function resolveImage(url: string): Promise<string> {
  if (!doc || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(url)) return url;
  const rel = normalizeRel(url);
  const pending = doc.pending.get(rel);
  if (pending) return pending.url;
  const sha = doc.entry?.assets[rel];
  if (!sha || !gh) return url;
  let blobUrl = blobUrlBySha.get(sha);
  if (!blobUrl) {
    const bytes = await gh.readBlob(sha);
    blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFromName(rel) }));
    blobUrlBySha.set(sha, blobUrl);
  }
  return blobUrl;
}

function takenNames(d: Doc): string[] {
  return [...Object.keys(d.entry?.assets ?? {}), ...d.pending.keys()];
}

async function addImage(file: File): Promise<string> {
  if (!doc) throw new Error('Chưa mở bài viết.');
  try {
    const image = await prepareImage(file, takenNames(doc));
    doc.pending.set(image.name, image);
    markDirty();
    return `./${image.name}`;
  } catch (err) {
    toast(errorMessage(err), 'error');
    throw err;
  }
}

async function syncCover() {
  if (!doc) return;
  const img = $<HTMLImageElement>('[data-cover-img]');
  const has = Boolean(doc.meta.cover);
  $('[data-cover-empty]').hidden = has;
  $('[data-action="remove-cover"]').hidden = !has;
  F.coverAlt().hidden = !has;
  img.hidden = !has;
  if (has) img.src = await resolveImage(doc.meta.cover!).catch(() => '');
}

$<HTMLInputElement>('[data-cover-input]').addEventListener('change', async (e) => {
  const input = e.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !doc) return;
  try {
    doc.meta.cover = await addImage(file);
    await syncCover();
  } catch {
    /* toast already shown */
  }
});

/* -- open / close -- */

async function buildEditor(text: string): Promise<StudioEditor> {
  let ready = false; // ignore anything the editor emits while it is still loading the document
  const instance = await createEditor({
    root: $('[data-editor]'),
    markdown: text,
    onUpload: addImage,
    resolveImage,
    onEditBlock: (block) => void editBlock(block),
    onChange(md) {
      if (!ready || md === markdown) return;
      markdown = md;
      syncDerived();
      markDirty();
    },
  });
  ready = true;
  return instance;
}

async function mountEditor(d: Doc, text: string) {
  await closeEditor();
  doc = d;
  markdown = text;
  fillForm(d);
  setMode('write');
  closeDrawers();
  show('editor');
  growFields(); // only measurable once the editor view is visible
  setStatus('saved', d.isNew ? 'Bài mới — chưa lưu lên blog' : 'Đã đồng bộ với blog');
  editor = await buildEditor(text);
  syncDerived();
  if (d.isNew && !d.meta.title) F.title().focus();
}

async function closeEditor() {
  flushLocal();
  stopAi();
  if (editor) await editor.destroy().catch(() => undefined);
  editor = null;
  doc = null;
  markdown = '';
  $('[data-editor]').replaceChildren();
}

async function offerRestore(id: string, baseSha: string | undefined): Promise<LocalDraft | null> {
  const local = loadLocalDraft(id);
  if (!local) return null;
  const stale = baseSha !== undefined && local.baseSha !== undefined && local.baseSha !== baseSha;
  const yes = await confirmDialog({
    title: 'Viết tiếp bản đang dở?',
    text: `Máy này còn giữ bản bạn sửa lúc ${new Date(local.savedAt).toLocaleString('vi-VN')} mà chưa lưu lên blog.${stale ? '\nLưu ý: bài trên blog đã thay đổi sau thời điểm đó.' : ''}`,
    ok: 'Viết tiếp',
  });
  if (!yes) clearLocalDraft(id);
  return yes ? local : null;
}

async function openNew(resume = true) {
  const local = resume ? loadLocalDraft('new') : null;
  const meta = local?.meta ?? emptyMeta();
  const d: Doc = {
    isNew: true,
    slug: local?.slug ?? '',
    meta,
    extra: {},
    origDates: { pubDate: meta.pubDate },
    wasPublished: false,
    pending: new Map(),
    slugTouched: Boolean(local?.slug),
    dirty: false,
  };
  if (rows.length === 0) void refreshRows().catch(() => undefined); // needed to detect a taken slug
  await mountEditor(d, local?.body ?? '');
  if (local) {
    d.dirty = true;
    setStatus('dirty', 'Chưa lưu lên blog · đã giữ bản nháp trên máy này');
    warnMissingImages(d, local.body);
  }
}

function warnMissingImages(d: Doc, text: string) {
  const missing = relativeImageRefs(text).filter((rel) => !d.pending.has(rel) && !d.entry?.assets[rel]);
  if (missing.length) toast(`${missing.length} ảnh chưa kịp lưu lên blog đã mất khi đóng trang — bạn chèn lại nhé.`, 'info');
}

async function openPost(slug: string) {
  show('boot');
  try {
    if (!rows.some((r) => r.entry.slug === slug)) await refreshRows();
    const row = rows.find((r) => r.entry.slug === slug);
    if (!row) {
      toast('Không tìm thấy bài viết này trên GitHub.', 'error');
      return go('#/');
    }
    if (row.entry.format === 'mdx') {
      toast('Bài MDX có component tương tác — hãy sửa trực tiếp trên GitHub.', 'info');
      return go('#/');
    }
    const file = parsePostFile(await gh!.readText(row.entry.sha));
    const local = await offerRestore(slug, row.entry.sha);
    const meta = local?.meta ?? file.meta;
    const d: Doc = {
      isNew: false,
      slug,
      entry: row.entry,
      meta,
      extra: file.extra,
      origDates: { pubDate: file.meta.pubDate, updatedDate: file.meta.updatedDate },
      wasPublished: !file.meta.draft,
      pending: new Map(),
      slugTouched: true,
      dirty: false,
    };
    await mountEditor(d, local?.body ?? file.body);
    if (local) {
      d.dirty = true;
      setStatus('dirty', 'Chưa lưu lên blog · đã giữ bản nháp trên máy này');
      warnMissingImages(d, local.body);
    }
  } catch (err) {
    toast(errorMessage(err), 'error');
    go('#/');
  }
}

/* -- form events -- */

$('[data-view-name="editor"]').addEventListener('input', (e) => {
  const target = e.target as HTMLElement;
  if (!doc || !target.matches('[data-f]')) return;
  target.removeAttribute('aria-invalid');
  if (target instanceof HTMLTextAreaElement && (target === F.title() || target === F.description())) autoGrow(target);
  if (target === F.slug()) doc.slugTouched = true;
  if (target === F.title() && doc.isNew && !doc.slugTouched) F.slug().value = slugify(F.title().value);
  syncDerived();
  markDirty();
});
// Enter in the title moves on instead of adding a line break.
F.title().addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    F.description().focus();
  }
});
F.description().addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    editor?.focus();
  }
});

/* -- mode + drawers -- */

function setMode(mode: 'write' | 'preview') {
  $('[data-view-name="editor"]').dataset.mode = mode;
  $$('[data-mode-btn]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modeBtn === mode)));
  $('[data-pane="write"]').hidden = mode !== 'write';
  $('[data-pane="preview"]').hidden = mode !== 'preview';
  if (mode === 'write') growFields();
  if (mode === 'preview') void renderPreview();
}

async function renderPreview() {
  if (!doc) return;
  const meta = readForm(doc);
  const images: Record<string, string> = {};
  await Promise.all(
    relativeImageRefs(markdown).map(async (rel) => {
      images[rel] = await resolveImage(rel).catch(() => '');
    }),
  );
  const cover = meta.cover ? await resolveImage(meta.cover).catch(() => '') : '';
  const article = $('[data-preview]');
  const status = statusOf({ ...meta, draft: !doc.wasPublished });

  const metaLine = el('p', { class: 'pv-meta' });
  metaLine.append(
    el('span', { class: 'chip', text: CATEGORY_NAME[meta.category] ?? '' }),
    `${formatDate(meta.pubDate)} · ${readingMinutes(markdown)} phút đọc`,
    el('span', { class: 'st-badge', 'data-tone': status, text: STATUS_LABEL[status] }),
  );
  const nodes: Node[] = [
    metaLine,
    el('h1', { class: meta.title ? 'pv-title' : 'pv-title pv-empty', text: meta.title || 'Chưa có tiêu đề' }),
    el('p', { class: meta.description ? 'pv-desc' : 'pv-desc pv-empty', text: meta.description || 'Chưa có mô tả ngắn' }),
    cover ? el('img', { class: 'pv-cover', src: cover, alt: meta.coverAlt ?? '' }) : el('div', { class: 'pv-cover pv-cover-auto', text: 'Ảnh bìa tự sinh theo chuyên mục' }),
  ];
  if (meta.summary || meta.takeaways?.length) {
    const box = el('section', { class: 'pv-tldr' }, el('h2', { text: 'Tóm tắt nhanh' }));
    if (meta.summary) box.append(el('p', { text: meta.summary }));
    if (meta.takeaways?.length) box.append(el('ul', {}, ...meta.takeaways.map((t) => el('li', { text: t }))));
    nodes.push(box);
  }
  const prose = el('div', { class: 'prose' });
  // Safe: markdown-it runs with html:false, so the result contains no author-supplied markup.
  prose.innerHTML = markdown.trim() ? renderMarkdown(markdown, images) : '<p class="pv-empty">Chưa có nội dung.</p>';
  nodes.push(prose);
  if (meta.tags.length) nodes.push(el('p', { class: 'pv-tags' }, ...meta.tags.map((t) => el('span', { class: 'chip', text: `# ${t}` }))));
  article.replaceChildren(...nodes);
}

$$('[data-mode-btn]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeBtn as 'write' | 'preview')));
$$('[data-device]').forEach((b) =>
  b.addEventListener('click', () => {
    $('[data-frame]').dataset.device = b.dataset.device!;
    $$('[data-device]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  }),
);

function closeDrawers() {
  $$('[data-drawer]').forEach((d) => (d.hidden = true));
  $$('[data-action="toggle-ai"], [data-action="toggle-settings"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

function toggleDrawer(name: 'settings' | 'ai') {
  const drawer = $(`[data-drawer="${name}"]`);
  const open = drawer.hidden;
  closeDrawers();
  drawer.hidden = !open;
  $(`[data-action="toggle-${name}"]`).setAttribute('aria-expanded', String(open));
  if (open && name === 'ai') void openAi();
}

/* -- block gallery -- */

const gallery = () => $<HTMLDialogElement>('[data-gallery]');

/** Built once: every block with a miniature of its real rendering (templates are our own trusted text). */
function buildGallery() {
  const host = $('[data-gallery-body]');
  if (host.childElementCount) return;
  for (const group of [...new Set(BLOCKS.map((b) => b.group))]) {
    const grid = el('div', { class: 'st-gallery-grid' });
    for (const block of BLOCKS.filter((b) => b.group === group)) {
      const mini = el('div');
      mini.innerHTML = block.render(block.template);
      const card = el(
        'button',
        { type: 'button', class: 'st-block', 'data-block': block.name },
        el('span', { class: 'st-block-thumb', 'aria-hidden': 'true' }, mini),
        el('span', {}, el('span', { class: 'st-block-name', text: block.label }), el('span', { class: 'st-block-desc', text: block.description })),
      );
      grid.append(card);
    }
    host.append(el('p', { class: 'st-gallery-group', text: group }), grid);
  }
}

function openGallery() {
  if (!editor) return;
  setMode('write');
  buildGallery();
  gallery().showModal();
}

$('[data-gallery-body]').addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('[data-block]');
  if (!card || !editor) return;
  gallery().close();
  void insertBlockViaForm(card.dataset.block!);
});

const confirmDiscard = () =>
  confirmDialog({ title: 'Bỏ thay đổi?', text: 'Những gì bạn vừa sửa trong khối này sẽ không được giữ lại.', ok: 'Bỏ thay đổi', danger: true });

/** Gallery → form (pre-filled with an example) → block in the post. */
async function insertBlockViaForm(name: string) {
  const def = BLOCKS.find((b) => b.name === name);
  if (!def || !editor) return;
  const result = await openBlockForm({ name, source: def.template, mode: 'insert', confirmDiscard });
  if (result?.action !== 'apply' || !editor) return;
  editor.insertBlock(result.name, result.source);
  markDirty();
}

/** "Sửa khối" on a block (or a double-click) → form → the block is updated in place. */
async function editBlock(block: BlockRef) {
  if (!editor) return;
  const result = await openBlockForm({ name: block.name, source: block.source, mode: 'edit', confirmDiscard });
  if (!result || !editor) return;
  if (result.action === 'delete') editor.deleteBlock(block.pos);
  else editor.updateBlock(block.pos, result.name, result.source);
  markDirty();
}
// Click on the backdrop closes the gallery.
gallery().addEventListener('click', (e) => {
  if (e.target === gallery()) gallery().close();
});

/* -- save -- */

function flagErrors(errors: { field: string; message: string }[]) {
  const inDrawer = new Set(['slug', 'pubDate', 'updatedDate', 'category', 'seriesOrder']);
  for (const e of errors) $(`[data-f="${e.field}"]`)?.setAttribute('aria-invalid', 'true');
  const first = errors[0]!;
  if (inDrawer.has(first.field) && $('[data-drawer="settings"]').hidden) toggleDrawer('settings');
  if (first.field !== 'body') {
    setMode('write');
    $(`[data-f="${first.field}"]`)?.focus();
  }
  toast(first.message, 'error');
}

async function save(publish: boolean) {
  if (!doc || !gh || busy) return;
  const d = doc;
  const meta = { ...readForm(d), draft: !publish };
  const slug = currentSlug(d);

  const errors = validatePost(meta, markdown, { publishing: publish });
  if (d.isNew) {
    if (!slug) errors.unshift({ field: 'slug', message: 'Bài cần có đường dẫn — thường tự sinh từ tiêu đề.' });
    else if (!isValidSlug(slug)) errors.unshift({ field: 'slug', message: 'Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang.' });
    else if (rows.some((r) => r.entry.slug === slug)) errors.unshift({ field: 'slug', message: 'Đã có bài dùng đường dẫn này — hãy đổi đường dẫn khác.' });
  }
  if (errors.length) return flagErrors(errors);

  const goingLive = publish && !d.wasPublished;
  const scheduled = Date.parse(meta.pubDate) > Date.now();
  if (goingLive) {
    const ok = await confirmDialog({
      title: scheduled ? 'Hẹn giờ đăng bài?' : 'Đăng bài lên blog?',
      text: scheduled
        ? `Bài sẽ tự xuất hiện trên blog vào ${formatDate(meta.pubDate)} (ở lần cập nhật đầu tiên của ngày hôm đó).`
        : 'Bài sẽ hiện công khai sau khoảng 1–2 phút, khi blog cập nhật xong.',
      ok: scheduled ? 'Hẹn giờ' : 'Đăng bài',
    });
    if (!ok) return;
  } else if (!publish && d.wasPublished) {
    const ok = await confirmDialog({ title: 'Gỡ bài về nháp?', text: 'Bài sẽ biến mất khỏi blog sau khoảng 1–2 phút. Nội dung vẫn được giữ nguyên ở đây.', ok: 'Gỡ về nháp', danger: true });
    if (!ok) return;
  }

  busy = true;
  setBusy(true);
  setStatus('saving', 'Đang lưu lên GitHub…');
  try {
    const dir = d.isNew ? `${POSTS_DIR}/${slug}` : d.entry!.dir || POSTS_DIR;
    const path = d.isNew ? postPath(slug) : d.entry!.path;

    // Someone (or another tab) changed the file since it was opened?
    if (!d.isNew) {
      const { entries } = await gh.listTree(POSTS_DIR);
      const remote = entries.find((e) => e.path === path);
      if (remote && remote.sha !== d.entry!.sha) {
        const overwrite = await confirmDialog({
          title: 'Bài trên blog đã thay đổi',
          text: 'Từ lúc bạn mở bài, file trên GitHub đã được sửa ở nơi khác. Lưu bây giờ sẽ ghi đè thay đổi đó.',
          ok: 'Vẫn ghi đè',
          danger: true,
        });
        if (!overwrite) {
          setStatus('dirty', 'Chưa lưu lên blog');
          return;
        }
      }
    }

    const used = new Set(relativeImageRefs(markdown));
    if (meta.cover) used.add(normalizeRel(meta.cover));
    const files = [
      { path, content: serializePostFile({ meta, body: markdown, extra: d.extra }) },
      ...[...d.pending.values()].filter((img) => used.has(img.name)).map((img) => ({ path: `${dir}/${img.name}`, content: img.bytes })),
    ];
    const title = meta.title.length > 60 ? `${meta.title.slice(0, 57)}…` : meta.title;
    const verb = d.isNew ? (publish ? 'Đăng bài' : 'Lưu nháp') : !publish && d.wasPublished ? 'Gỡ về nháp' : goingLive ? 'Đăng bài' : 'Cập nhật bài';
    await gh.commit(`${verb} "${title}"`, files);

    // Re-read the tree so shas (and the new post) are current, then keep editing the same post.
    clearLocalDraft(localId(d));
    await refreshRows().catch(() => undefined);
    const entry = rows.find((r) => r.entry.slug === slug)?.entry;
    for (const img of d.pending.values()) {
      const sha = entry?.assets[img.name];
      if (sha) blobUrlBySha.set(sha, img.url);
    }
    d.pending.clear();
    d.isNew = false;
    d.slug = slug;
    d.entry = entry ?? d.entry;
    d.meta = meta;
    d.origDates = { pubDate: meta.pubDate, updatedDate: meta.updatedDate };
    d.wasPublished = publish;
    d.dirty = false;
    $('[data-slug-field]').hidden = true;
    $('[data-action="delete"]').hidden = false;
    history.replaceState(null, '', `#/edit/${slug}`);
    syncDerived();

    const when = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setStatus('saved', `Đã lưu lên blog lúc ${when}`);
    if (!publish) toast('Đã lưu bản nháp lên GitHub.');
    else if (scheduled) toast(`Đã hẹn giờ đăng vào ${formatDate(meta.pubDate)}.`);
    else toast('Đã gửi lên blog — bài hiện sau khoảng 1–2 phút.', 'ok', { label: 'Mở bài', href: `/bai-viet/${slug}/` });
  } catch (err) {
    setStatus('error', 'Lưu chưa thành công');
    toast(errorMessage(err), 'error');
    if (err instanceof GitHubError && err.status === 401) signOut();
  } finally {
    busy = false;
    setBusy(false);
  }
}

function setBusy(on: boolean) {
  $$<HTMLButtonElement>('[data-action="save-draft"], [data-action="publish"], [data-action="delete"]').forEach((b) => (b.disabled = on));
}

async function deletePost() {
  if (!doc || !gh || doc.isNew || !doc.entry || busy) return;
  const d = doc;
  const ok = await confirmDialog({
    title: 'Xoá bài viết này?',
    text: `"${d.meta.title || d.slug}" và ảnh của bài sẽ bị xoá khỏi blog. Vẫn có thể khôi phục từ lịch sử GitHub nếu cần.`,
    ok: 'Xoá bài',
    danger: true,
  });
  if (!ok) return;
  busy = true;
  setBusy(true);
  setStatus('saving', 'Đang xoá…');
  try {
    const entry = d.entry!;
    const assets = entry.dir ? Object.keys(entry.assets).map((name) => `${entry.dir}/${name}`) : [];
    await gh.commit(`Xoá bài "${d.meta.title || d.slug}"`, [], [entry.path, ...assets]);
    clearLocalDraft(d.slug);
    d.dirty = false;
    toast('Đã xoá bài viết.');
    go('#/');
  } catch (err) {
    setStatus('error', 'Xoá chưa thành công');
    toast(errorMessage(err), 'error');
  } finally {
    busy = false;
    setBusy(false);
  }
}

/* -------------------------------------------------------------------- ai */

let aiReady: boolean | null = null;
let aiAbort: AbortController | null = null;
let aiRange: Range | null = null;
let aiSelectionText = '';
/** Editor content when the selection was captured: a stale range must not overwrite the wrong text. */
let aiSelectionDoc = '';

async function openAi() {
  if (aiReady === null) aiReady = await aiAvailable();
  $('[data-ai-off]').hidden = aiReady;
  $('[data-ai-on]').hidden = !aiReady;
  const topic = $<HTMLInputElement>('[data-ai="topic"]');
  if (!topic.value) topic.value = F.title().value.trim();
  captureSelection();
}

function captureSelection() {
  const sel = editor?.selection() ?? null;
  if (sel) {
    aiRange = sel.range;
    aiSelectionText = sel.markdown;
    aiSelectionDoc = markdown;
  }
  const box = $('[data-ai-selection]');
  box.dataset.empty = String(!aiSelectionText);
  box.textContent = aiSelectionText || 'Chưa chọn đoạn nào.';
}

document.addEventListener('selectionchange', () => {
  if (!editor || $('[data-drawer="ai"]').hidden) return;
  const anchor = document.getSelection()?.anchorNode;
  if (anchor && $('[data-editor]').contains(anchor)) captureSelection();
});

function setAiTab(tab: string) {
  $$('[data-ai-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aiTab === tab)));
  $$('[data-ai-panel]').forEach((p) => (p.hidden = p.dataset.aiPanel !== tab));
  $('[data-ai-out]').hidden = true;
  $('[data-ai-error]').hidden = true;
}
$$('[data-ai-tab]').forEach((b) => b.addEventListener('click', () => setAiTab(b.dataset.aiTab!)));

function stopAi() {
  aiAbort?.abort();
  aiAbort = null;
}

function aiError(err: unknown) {
  if ((err as Error)?.name === 'AbortError') return;
  const box = $('[data-ai-error]');
  box.textContent = errorMessage(err);
  box.hidden = false;
}

type AiAction = { label: string; primary?: boolean; run: (text: string) => void | Promise<void> };

/** Run a streaming AI task and show the result with follow-up buttons. */
async function runAi(title: string, request: AiRequest, actions: AiAction[], target?: HTMLTextAreaElement) {
  stopAi();
  const out = $('[data-ai-out]');
  const textBox = $('[data-ai-text]');
  const actionRow = $('[data-ai-actions]');
  const stop = $('[data-action="ai-stop"]');
  $('[data-ai-error]').hidden = true;
  $('[data-ai-out-title]').textContent = title;
  actionRow.hidden = true;
  actionRow.replaceChildren();
  textBox.replaceChildren();
  out.hidden = Boolean(target);
  out.dataset.busy = 'true';
  stop.hidden = false;
  if (target) target.value = '';
  aiAbort = new AbortController();
  const signal = aiAbort.signal;
  let frame = 0;
  try {
    const text = await aiStream(
      request,
      token,
      (soFar) => {
        if (target) {
          target.value = soFar;
          return;
        }
        // Re-render at most once per frame; html:false keeps this safe.
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          textBox.innerHTML = renderMarkdown(soFar);
          textBox.scrollTop = textBox.scrollHeight;
        });
      },
      signal,
    );
    cancelAnimationFrame(frame);
    if (target) target.value = text;
    else textBox.innerHTML = renderMarkdown(text);
    if (!text) throw new Error('AI không trả về nội dung. Bạn thử lại nhé.');
    for (const a of actions) {
      const btn = el('button', { type: 'button', class: `btn ${a.primary ? 'btn-primary' : 'btn-ghost'} st-btn-sm`, text: a.label });
      btn.addEventListener('click', () => void a.run(text));
      actionRow.append(btn);
    }
    actionRow.hidden = actions.length === 0;
  } catch (err) {
    cancelAnimationFrame(frame);
    aiError(err);
  } finally {
    out.dataset.busy = 'false';
    stop.hidden = true;
    if (aiAbort?.signal === signal) aiAbort = null;
  }
}

const aiField = (name: string) => $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-ai="${name}"]`).value.trim();

function draftInputs() {
  return { topic: aiField('topic') || F.title().value.trim(), notes: aiField('notes'), category: F.category().value };
}

async function insertDraft(text: string, replaceAll: boolean) {
  if (!editor || !doc) return;
  if (replaceAll) {
    if (markdown.trim()) {
      const ok = await confirmDialog({ title: 'Thay toàn bộ nội dung?', text: 'Nội dung đang có trong bài sẽ được thay bằng bản nháp của AI.', ok: 'Thay nội dung', danger: true });
      if (!ok) return;
    }
    // Rebuild the editor with the new document (clean undo history, images re-resolved).
    const d = doc;
    await editor.destroy().catch(() => undefined);
    $('[data-editor]').replaceChildren();
    markdown = text;
    editor = await buildEditor(text);
    doc = d;
  } else {
    editor.append(text);
  }
  syncDerived();
  markDirty();
  toast('Đã đưa bản nháp vào bài — hãy đọc và chỉnh lại theo giọng của bạn.');
}

function runRewrite(mode: 'improve' | 'shorter' | 'longer' | 'fix' | 'simpler' | 'custom', instruction = '') {
  captureSelection();
  if (!aiSelectionText) {
    aiError(new Error('Bạn bôi đen một đoạn trong bài trước đã nhé.'));
    return;
  }
  const range = aiRange;
  const base = aiSelectionDoc;
  void runAi('Đoạn đã sửa', { action: 'rewrite', text: aiSelectionText, mode, instruction, title: F.title().value.trim() }, [
    {
      label: 'Thay đoạn đã chọn',
      primary: true,
      run(text) {
        if (!editor || !range) return;
        if (markdown !== base) {
          aiError(new Error('Bài đã thay đổi từ lúc bạn chọn đoạn. Hãy bôi đen lại đoạn cần thay, hoặc dùng “Chèn tại con trỏ”.'));
          return;
        }
        editor.replace(range, text);
        aiSelectionText = '';
        aiRange = null;
        captureSelection();
        toast('Đã thay đoạn văn.');
      },
    },
    { label: 'Chèn tại con trỏ', run: (text) => editor?.insertAtCursor(text) },
    {
      label: 'Sao chép',
      run: (text) => navigator.clipboard.writeText(text).then(() => toast('Đã sao chép.'), () => toast('Không sao chép được.', 'error')),
    },
  ]);
}

$$('[data-ai-mode]').forEach((b) => b.addEventListener('click', () => runRewrite(b.dataset.aiMode as 'improve')));
$<HTMLFormElement>('[data-form="ai-custom"]').addEventListener('submit', (e) => {
  e.preventDefault();
  const instruction = aiField('instruction');
  if (!instruction) return;
  runRewrite('custom', instruction);
});

async function runMeta() {
  if (!doc) return;
  const out = $('[data-ai-meta-out]');
  const btn = $<HTMLButtonElement>('[data-action="ai-meta"]');
  $('[data-ai-error]').hidden = true;
  btn.disabled = true;
  out.replaceChildren(el('p', { class: 'st-muted', text: 'AI đang đọc bài…' }));
  stopAi();
  aiAbort = new AbortController();
  try {
    const meta = await aiMeta(F.title().value.trim(), markdown, token, aiAbort.signal);
    const apply = (field: keyof typeof F, value: string, message: string) => {
      const input = F[field]() as HTMLInputElement | HTMLTextAreaElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toast(message);
    };
    const card = (label: string, onUse: (() => void) | null, ...content: Node[]) => {
      const head = el('div', { class: 'st-sugg-head' }, el('span', { class: 'st-label', text: label }));
      if (onUse) {
        const use = el('button', { type: 'button', class: 'btn btn-ghost st-btn-sm', text: 'Dùng' });
        use.addEventListener('click', onUse);
        head.append(use);
      }
      return el('div', { class: 'st-sugg' }, head, ...content);
    };
    const cards: Node[] = [];
    if (meta.titles.length) {
      cards.push(
        card('Tiêu đề (bấm để dùng)', null, ...meta.titles.map((t) => {
          const pick = el('button', { type: 'button', class: 'st-pick', text: t });
          pick.addEventListener('click', () => apply('title', t, 'Đã đổi tiêu đề.'));
          return pick;
        })),
      );
    }
    if (meta.description) cards.push(card(`Mô tả ngắn (${meta.description.length} ký tự)`, () => apply('description', meta.description, 'Đã dùng mô tả.'), el('p', { text: meta.description })));
    if (meta.tags.length) cards.push(card('Thẻ', () => apply('tags', meta.tags.join(', '), 'Đã dùng các thẻ.'), el('p', { text: meta.tags.join(', ') })));
    if (meta.summary) cards.push(card('Tóm tắt nhanh', () => apply('summary', meta.summary, 'Đã dùng tóm tắt.'), el('p', { text: meta.summary })));
    if (meta.takeaways.length) {
      cards.push(card('Ý chính rút ra', () => apply('takeaways', meta.takeaways.join('\n'), 'Đã dùng các ý chính.'), el('ul', {}, ...meta.takeaways.map((t) => el('li', { text: t })))));
    }
    out.replaceChildren(...(cards.length ? cards : [el('p', { class: 'st-muted', text: 'AI chưa đưa ra được gợi ý. Bạn thử lại nhé.' })]));
  } catch (err) {
    out.replaceChildren();
    aiError(err);
  } finally {
    btn.disabled = false;
    aiAbort = null;
  }
}

/* --------------------------------------------------------------- actions */

const actions: Record<string, (e: Event) => void | Promise<void>> = {
  logout: async () => {
    if (doc?.dirty) flushLocal();
    if (await confirmDialog({ title: 'Đăng xuất?', text: 'Token sẽ bị xoá khỏi trình duyệt này. Bài đang viết dở vẫn được giữ trên máy.', ok: 'Đăng xuất' })) {
      await closeEditor();
      signOut();
    }
  },
  new: () => go('#/new'), // resumes the unsaved new post if there is one (the list offers "Bỏ" to discard it)
  'resume-new': () => go('#/new'),
  'discard-new': async () => {
    if (await confirmDialog({ title: 'Bỏ bài đang viết dở?', text: 'Bản nháp chưa lưu lên blog sẽ bị xoá khỏi máy này.', ok: 'Bỏ bản nháp', danger: true })) {
      clearLocalDraft('new');
      renderRows();
    }
  },
  back: () => go('#/'),
  'toggle-settings': () => toggleDrawer('settings'),
  'toggle-ai': () => toggleDrawer('ai'),
  'insert-block': openGallery,
  'close-gallery': () => gallery().close(),
  'close-drawer': closeDrawers,
  'save-draft': () => save(false),
  publish: () => save(true),
  delete: deletePost,
  'remove-cover': () => {
    if (!doc) return;
    doc.meta.cover = undefined;
    doc.meta.coverAlt = undefined;
    F.coverAlt().value = '';
    void syncCover();
    markDirty();
  },
  'ai-outline': () => runAi('Dàn ý', { action: 'outline', ...draftInputs() }, [], $<HTMLTextAreaElement>('[data-ai="outline"]')),
  'ai-draft': () =>
    runAi('Bản nháp', { action: 'draft', ...draftInputs(), outline: aiField('outline'), length: aiField('length') as 'medium' }, [
      { label: 'Chèn vào cuối bài', primary: true, run: (text) => insertDraft(text, false) },
      { label: 'Thay toàn bộ nội dung', run: (text) => insertDraft(text, true) },
    ]),
  'ai-meta': runMeta,
  'ai-stop': stopAi,
};

document.addEventListener('click', (e) => {
  const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!trigger) return;
  const run = actions[trigger.dataset.action!];
  if (run) void run(e);
});

document.addEventListener('keydown', (e) => {
  if (body.dataset.view !== 'editor' || !doc) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save(doc.wasPublished); // Ctrl+S keeps the post's current state: a draft stays a draft
  } else if (e.key === 'Escape' && !$<HTMLDialogElement>('[data-dialog]').open) {
    closeDrawers();
  }
});

$('[data-theme-toggle]').addEventListener('click', (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  toggleTheme({ x: (e as MouseEvent).clientX || r.left + r.width / 2, y: (e as MouseEvent).clientY || r.top + r.height / 2 });
});

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', flushLocal);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushLocal();
});

/* ------------------------------------------------------------------ boot */

async function boot() {
  initTheme();
  const saved = loadToken();
  if (!saved) return show('login');
  try {
    await signIn(saved, null);
    route();
  } catch (err) {
    // An expired or revoked token: forget it. A network hiccup: keep it and let the author retry.
    if (err instanceof GitHubError && err.status !== 0) clearToken();
    const box = $('[data-login-error]');
    box.textContent = errorMessage(err);
    box.hidden = false;
    show('login');
  }
}

void boot();
