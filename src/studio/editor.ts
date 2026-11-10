/**
 * The visual (WYSIWYG) editor of the writing studio: Milkdown Crepe, which reads and writes Markdown
 * natively — what you see is exactly what gets committed to the repo.
 *
 * Code blocks are drawn by our own node view (below) instead of Crepe's CodeMirror feature:
 *   • a "khối nội dung" fence (```steps, ```chart…) shows as the finished block with a "Sửa khối"
 *     button that opens the form editor — the author never sees its text syntax;
 *   • an ordinary code block is a plain <pre><code> with a language box.
 * CodeMirror injects <style> elements at runtime, which the site's CSP blocks (it left the code
 * editor without a caret and with a broken layout) — and relaxing the CSP for it is not worth it.
 */
import { Crepe } from '@milkdown/crepe';
// Only the stylesheets of the features in use (common/style.css also pulls in KaTeX with data: fonts,
// which the site's CSP rightly blocks).
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/block-edit.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/link-tooltip.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/toolbar.css';
import '@milkdown/crepe/theme/common/table.css';
import '@milkdown/crepe/theme/common/top-bar.css';
import { editorViewCtx } from '@milkdown/kit/core';
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import { Selection } from '@milkdown/kit/prose/state';
import { $view, getMarkdown, insert, replaceRange } from '@milkdown/kit/utils';
import { BLOCKS, isBlock, renderBlock } from '../lib/blocks';

export interface Range {
  from: number;
  to: number;
}

/** A "khối nội dung" in the document: where it is, which block, and its source text. */
export interface BlockRef {
  pos: number;
  name: string;
  source: string;
}

export interface EditorOptions {
  root: HTMLElement;
  markdown: string;
  /** Called with a picked/pasted/dropped image; returns the URL to write in Markdown ("./name.webp"). */
  onUpload: (file: File) => Promise<string>;
  /** Maps a Markdown image URL to something the browser can display (blob: URL for local images). */
  resolveImage: (url: string) => Promise<string> | string;
  onChange: (markdown: string) => void;
  /** The author asked to edit a block (button or double-click). */
  onEditBlock: (block: BlockRef) => void;
}

export interface StudioEditor {
  getMarkdown(): string;
  /** Current selection as Markdown, or null when nothing is selected. */
  selection(): { range: Range; markdown: string } | null;
  /** Replace a range captured earlier with new Markdown. */
  replace(range: Range, markdown: string): void;
  insertAtCursor(markdown: string): void;
  append(markdown: string): void;
  insertBlock(name: string, source: string): void;
  updateBlock(pos: number, name: string, source: string): void;
  deleteBlock(pos: number): void;
  focus(): void;
  destroy(): Promise<void>;
}

/** Fence that cannot be closed early by the content. */
export function fenced(name: string, source: string): string {
  const longest = Math.max(2, ...[...source.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${name}\n${source}\n${fence}`;
}

const BLOCK_LABEL = new Map(BLOCKS.map((b) => [b.name, b.label]));

function codeBlockView(onEditBlock: (block: BlockRef) => void) {
  return $view(codeBlockSchema.node, () => (initial, view, getPos) => {
    let node = initial;
    const language = () => String(node.attrs.language ?? '').trim().toLowerCase();
    const dom = document.createElement('div');

    /* ── a "khối nội dung": rendered block, edited through the form ── */
    if (isBlock(language())) {
      dom.className = 'st-blk';
      dom.contentEditable = 'false';
      const body = document.createElement('div');
      body.className = 'st-blk-body';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'st-blk-edit';
      const paint = () => {
        // renderBlock escapes everything itself (src/lib/blocks.ts).
        body.innerHTML = renderBlock(language(), node.textContent) ?? '';
        edit.textContent = `Sửa ${(BLOCK_LABEL.get(language()) ?? 'khối').toLowerCase()}`;
        edit.setAttribute('aria-label', `Sửa khối ${BLOCK_LABEL.get(language()) ?? ''}`);
      };
      const open = () => {
        const pos = getPos();
        if (typeof pos === 'number') onEditBlock({ pos, name: language(), source: node.textContent });
      };
      edit.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
      dom.addEventListener('dblclick', (e) => {
        e.preventDefault();
        open();
      });
      // Links and buttons inside the preview must not navigate away from unsaved work.
      body.addEventListener('click', (e) => {
        if ((e.target as Element).closest('a')) e.preventDefault();
      });
      dom.append(body, edit);
      paint();
      return {
        dom,
        update(next) {
          if (next.type !== node.type || !isBlock(String(next.attrs.language ?? '').trim().toLowerCase())) return false;
          node = next;
          paint();
          return true;
        },
        stopEvent: (e) => edit.contains(e.target as Node),
        ignoreMutation: () => true,
        selectNode: () => dom.classList.add('is-selected'),
        deselectNode: () => dom.classList.remove('is-selected'),
      };
    }

    /* ── an ordinary code block ── */
    dom.className = 'st-code';
    const head = document.createElement('div');
    head.className = 'st-code-head';
    head.contentEditable = 'false';
    const lang = document.createElement('input');
    lang.className = 'st-code-lang';
    lang.placeholder = 'ngôn ngữ: js, bash, html…';
    lang.setAttribute('aria-label', 'Ngôn ngữ của khối mã');
    lang.spellcheck = false;
    lang.autocomplete = 'off';
    lang.value = language();
    const commit = () => {
      const value = lang.value.trim().toLowerCase().replace(/[^a-z0-9+#._-]/g, '');
      const pos = getPos();
      if (typeof pos !== 'number' || value === language()) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: value }));
    };
    lang.addEventListener('change', commit);
    lang.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        view.focus();
      }
    });
    head.append(lang);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.spellcheck = false;
    pre.append(code);
    dom.append(head, pre);
    return {
      dom,
      contentDOM: code,
      update(next) {
        if (next.type !== node.type || isBlock(String(next.attrs.language ?? '').trim().toLowerCase())) return false;
        node = next;
        if (document.activeElement !== lang) lang.value = language();
        return true;
      },
      stopEvent: (e) => head.contains(e.target as Node),
      ignoreMutation: (m) => !code.contains(m.target),
    };
  });
}

export async function createEditor(opts: EditorOptions): Promise<StudioEditor> {
  const crepe = new Crepe({
    root: opts.root,
    defaultValue: opts.markdown,
    features: {
      [Crepe.Feature.TopBar]: true, // fixed formatting bar, like a word processor
      [Crepe.Feature.Latex]: false, // the blog does not render math
      [Crepe.Feature.CodeMirror]: false, // see the note at the top of this file
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: 'Bắt đầu viết… gõ "/" để chèn tiêu đề, ảnh, bảng, mã', mode: 'block' },
      [Crepe.Feature.TopBar]: {
        headingOptions: [
          { label: 'Đoạn văn', level: null },
          { label: 'Tiêu đề lớn (H2)', level: 2 },
          { label: 'Tiêu đề vừa (H3)', level: 3 },
          { label: 'Tiêu đề nhỏ (H4)', level: 4 },
        ],
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: 'Văn bản',
          text: { label: 'Đoạn văn' },
          h1: null, // the page title is the only H1
          h2: { label: 'Tiêu đề lớn (H2)' },
          h3: { label: 'Tiêu đề vừa (H3)' },
          h4: { label: 'Tiêu đề nhỏ (H4)' },
          h5: null,
          h6: null,
          quote: { label: 'Trích dẫn' },
          divider: { label: 'Đường kẻ ngang' },
        },
        listGroup: {
          label: 'Danh sách',
          bulletList: { label: 'Gạch đầu dòng' },
          orderedList: { label: 'Đánh số' },
          taskList: { label: 'Việc cần làm' },
        },
        advancedGroup: {
          label: 'Chèn',
          image: { label: 'Ảnh' },
          codeBlock: { label: 'Khối mã' },
          table: { label: 'Bảng' },
          math: null,
        },
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: opts.onUpload,
        inlineOnUpload: opts.onUpload,
        blockOnUpload: opts.onUpload,
        proxyDomURL: opts.resolveImage,
        blockUploadButton: 'Chọn ảnh',
        blockUploadPlaceholderText: 'hoặc dán đường dẫn ảnh',
        blockCaptionPlaceholderText: 'Chú thích ảnh (cũng là mô tả cho trình đọc màn hình)',
        blockConfirmButton: 'Xong',
        inlineUploadButton: 'Chọn ảnh',
        inlineUploadPlaceholderText: 'hoặc dán đường dẫn ảnh',
        inlineConfirmButton: 'Xong',
      },
      [Crepe.Feature.LinkTooltip]: { inputPlaceholder: 'Dán đường dẫn…' },
    },
  });

  crepe.editor.use(codeBlockView(opts.onEditBlock));
  crepe.on((listener) => listener.markdownUpdated((_ctx, markdown) => opts.onChange(markdown)));
  await crepe.create();

  const act = <T>(fn: Parameters<typeof crepe.editor.action<T>>[0]) => crepe.editor.action(fn);

  return {
    getMarkdown: () => crepe.getMarkdown(),
    selection() {
      return act((ctx) => {
        const { from, to, empty } = ctx.get(editorViewCtx).state.selection;
        if (empty) return null;
        const markdown = getMarkdown({ from, to })(ctx).trim();
        return markdown ? { range: { from, to }, markdown } : null;
      });
    },
    replace(range, markdown) {
      act((ctx) => {
        const size = ctx.get(editorViewCtx).state.doc.content.size;
        replaceRange(markdown, { from: Math.min(range.from, size), to: Math.min(range.to, size) })(ctx);
      });
    },
    insertAtCursor(markdown) {
      act(insert(markdown));
    },
    append(markdown) {
      act((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
        insert(markdown)(ctx);
      });
    },
    insertBlock(name, source) {
      act(insert(fenced(name, source)));
    },
    updateBlock(pos, name, source) {
      act((ctx) => {
        const view = ctx.get(editorViewCtx);
        const node = view.state.doc.nodeAt(pos);
        if (!node || node.type.name !== 'code_block') return;
        const next = node.type.create({ ...node.attrs, language: name }, source ? view.state.schema.text(source) : undefined);
        view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, next));
      });
    },
    deleteBlock(pos) {
      act((ctx) => {
        const view = ctx.get(editorViewCtx);
        const node = view.state.doc.nodeAt(pos);
        if (node?.type.name === 'code_block') view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      });
    },
    focus() {
      act((ctx) => ctx.get(editorViewCtx).focus());
    },
    async destroy() {
      await crepe.destroy();
    },
  };
}
