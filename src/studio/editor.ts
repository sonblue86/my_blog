/**
 * The visual (WYSIWYG) editor of the writing studio: Milkdown Crepe, which reads and writes Markdown
 * natively — what you see is exactly what gets committed to the repo.
 */
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import { editorViewCtx } from '@milkdown/kit/core';
import { Selection } from '@milkdown/kit/prose/state';
import { getMarkdown, insert, replaceRange } from '@milkdown/kit/utils';

export interface Range {
  from: number;
  to: number;
}

export interface EditorOptions {
  root: HTMLElement;
  markdown: string;
  /** Called with a picked/pasted/dropped image; returns the URL to write in Markdown ("./name.webp"). */
  onUpload: (file: File) => Promise<string>;
  /** Maps a Markdown image URL to something the browser can display (blob: URL for local images). */
  resolveImage: (url: string) => Promise<string> | string;
  onChange: (markdown: string) => void;
}

export interface StudioEditor {
  getMarkdown(): string;
  /** Current selection as Markdown, or null when nothing is selected. */
  selection(): { range: Range; markdown: string } | null;
  /** Replace a range captured earlier with new Markdown. */
  replace(range: Range, markdown: string): void;
  insertAtCursor(markdown: string): void;
  append(markdown: string): void;
  focus(): void;
  destroy(): Promise<void>;
}

export async function createEditor(opts: EditorOptions): Promise<StudioEditor> {
  const crepe = new Crepe({
    root: opts.root,
    defaultValue: opts.markdown,
    features: {
      [Crepe.Feature.TopBar]: true, // fixed formatting bar, like a word processor
      [Crepe.Feature.Latex]: false, // the blog does not render math
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
      [Crepe.Feature.CodeMirror]: { searchPlaceholder: 'Tìm ngôn ngữ', noResultText: 'Không có kết quả', copyText: 'Sao chép' },
    },
  });

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
    focus() {
      act((ctx) => ctx.get(editorViewCtx).focus());
    },
    async destroy() {
      await crepe.destroy();
    },
  };
}
