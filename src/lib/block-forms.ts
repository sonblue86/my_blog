/**
 * Form model of every "khối nội dung": lets the writing studio edit a block with ordinary inputs
 * (title, list of steps, table of numbers…) instead of its text syntax.
 *
 *   source text ──parse()──▶ BlockModel ──(form edits)──▶ serialize() ──▶ source text
 *
 * The text syntax (src/lib/blocks.ts) stays the single storage format, so a block edited by hand in
 * the Markdown file and a block edited in the form are the same thing.
 * Pure TypeScript: no DOM.
 */
import { clean, parseChart, rows, sections } from './blocks';

export interface BlockModel {
  /** Single values, by field key. */
  fields: Record<string, string>;
  /** Repeatable items, by list key; each item maps column key → value. */
  lists: Record<string, Record<string, string>[]>;
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Relative width inside a row of columns (default 1). */
  grow?: number;
}

export interface FormList {
  key: string;
  label: string;
  /** "Bước", "Mốc"… used for "Thêm bước" and the item badge. */
  item: string;
  columns: FormField[];
}

export interface BlockForm {
  fields: FormField[];
  lists: FormList[];
  /** One sentence shown at the top of the form. */
  hint?: string;
  parse(source: string): BlockModel;
  serialize(model: BlockModel): string;
}

/* ----------------------------------------------------------------- helpers */

/** A value that must stay on one line. */
const one = (s: string | undefined) => (s ?? '').replace(/\s*\n+\s*/g, ' ').trim();
/** A cell of an "a | b | c" row: one line, and no "|" (it would split the cell). */
const cell = (s: string | undefined) => one(s).replace(/\|/g, '/');
/** Free text: trim outer blank lines, keep inner line breaks. */
const text = (s: string | undefined) => (s ?? '').replace(/\r\n?/g, '\n').replace(/^\s*\n/, '').trimEnd();
/** Body text inside "# heading" based blocks: a line starting with "#" would become a new item. */
const body = (s: string | undefined) =>
  text(s)
    .split('\n')
    .map((l) => l.replace(/^(\s*)#/, '$1＃'))
    .join('\n');

const joinBody = (lines: string[]) => lines.join('\n').replace(/^\s*\n/, '').trimEnd();

/* ------------------------------------------------------------------- forms */

const calloutForm: BlockForm = {
  fields: [
    { key: 'title', label: 'Tiêu đề', type: 'text', placeholder: 'Bỏ trống để dùng tên mặc định của hộp' },
    { key: 'body', label: 'Nội dung', type: 'textarea', placeholder: 'Mỗi đoạn cách nhau một dòng trống. Dòng bắt đầu bằng "- " là gạch đầu dòng.' },
  ],
  lists: [],
  parse(source) {
    const all = clean(source);
    const first = all.findIndex((l) => l.trim());
    const h = first >= 0 ? /^#{1,3}\s+(.*)$/.exec(all[first]!.trim()) : null;
    return { fields: { title: h ? h[1]!.trim() : '', body: joinBody(h ? all.slice(first + 1) : all) }, lists: {} };
  },
  serialize({ fields }) {
    const title = one(fields.title);
    return [title ? `# ${title}` : '', text(fields.body)].filter(Boolean).join('\n');
  },
};

const keypointForm: BlockForm = {
  fields: [{ key: 'text', label: 'Ý chính', type: 'textarea', placeholder: 'Một hai câu bạn muốn người đọc nhớ nhất.' }],
  lists: [],
  parse: (source) => ({ fields: { text: text(source) }, lists: {} }),
  serialize: ({ fields }) => text(fields.text),
};

const quoteForm: BlockForm = {
  fields: [
    { key: 'text', label: 'Câu trích', type: 'textarea', placeholder: 'Nội dung câu nói.' },
    { key: 'author', label: 'Người nói', type: 'text', placeholder: 'Tên, chức danh (tuỳ chọn)' },
  ],
  lists: [],
  parse(source) {
    const all = clean(source).filter((l) => l.trim());
    const last = all.length ? /^[—–-]{1,2}\s*(.+)$/.exec(all[all.length - 1]!.trim()) : null;
    return { fields: { text: (last ? all.slice(0, -1) : all).join('\n'), author: last ? last[1]!.trim() : '' }, lists: {} };
  },
  serialize({ fields }) {
    const author = one(fields.author);
    return [text(fields.text), author ? `— ${author}` : ''].filter(Boolean).join('\n');
  },
};

function sectionsForm(item: string, titlePlaceholder: string, bodyPlaceholder: string): BlockForm {
  return {
    fields: [],
    lists: [
      {
        key: 'items',
        label: `${item} `,
        item,
        columns: [
          { key: 'title', label: 'Tiêu đề', type: 'text', placeholder: titlePlaceholder },
          { key: 'body', label: 'Mô tả', type: 'textarea', placeholder: bodyPlaceholder },
        ],
      },
    ],
    parse: (source) => ({ fields: {}, lists: { items: sections(source).map((s) => ({ title: s.title, body: joinBody(s.body) })) } }),
    serialize: ({ lists }) =>
      (lists.items ?? [])
        .filter((i) => one(i.title) || text(i.body))
        .map((i) => [`# ${one(i.title) || '…'}`, body(i.body)].filter(Boolean).join('\n'))
        .join('\n\n'),
  };
}

const prosconsForm: BlockForm = {
  fields: [
    { key: 'prosTitle', label: 'Tên cột trái', type: 'text', placeholder: 'Ưu điểm' },
    { key: 'consTitle', label: 'Tên cột phải', type: 'text', placeholder: 'Nhược điểm' },
  ],
  lists: [
    { key: 'pros', label: 'Ưu điểm', item: 'Ưu điểm', columns: [{ key: 'text', label: 'Nội dung', type: 'text', placeholder: 'Một điểm mạnh' }] },
    { key: 'cons', label: 'Nhược điểm', item: 'Nhược điểm', columns: [{ key: 'text', label: 'Nội dung', type: 'text', placeholder: 'Một điểm yếu' }] },
  ],
  parse(source) {
    const model: BlockModel = { fields: { prosTitle: '', consTitle: '' }, lists: { pros: [], cons: [] } };
    let current: Record<string, string>[] | null = null;
    for (const raw of clean(source)) {
      const line = raw.trim();
      const h = /^#{1,3}\s+(.*)$/.exec(line);
      if (h) {
        const [a = '', b = ''] = h[1]!.split('|').map((s) => s.trim());
        model.fields.prosTitle = a;
        model.fields.consTitle = b;
      } else if (line.startsWith('+')) {
        current = model.lists.pros!;
        current.push({ text: line.slice(1).trim() });
      } else if (/^[-–−]/.test(line)) {
        current = model.lists.cons!;
        current.push({ text: line.slice(1).trim() });
      } else if (line && current?.length) {
        current[current.length - 1]!.text += ` ${line}`;
      }
    }
    return model;
  },
  serialize({ fields, lists }) {
    const a = cell(fields.prosTitle);
    const b = cell(fields.consTitle);
    const head = a || b ? `# ${a || 'Ưu điểm'} | ${b || 'Nhược điểm'}` : '';
    const pros = (lists.pros ?? []).map((i) => one(i.text)).filter(Boolean).map((t) => `+ ${t}`);
    const cons = (lists.cons ?? []).map((i) => one(i.text)).filter(Boolean).map((t) => `- ${t}`);
    return [head, ...pros, ...cons].filter(Boolean).join('\n');
  },
};

function rowsForm(item: string, columns: FormField[], hint?: string): BlockForm {
  return {
    fields: [],
    hint,
    lists: [{ key: 'rows', label: item, item, columns }],
    parse: (source) => ({
      fields: {},
      lists: {
        rows: rows(source).map((cells) => {
          const row: Record<string, string> = {};
          columns.forEach((c, i) => (row[c.key] = i === columns.length - 1 ? cells.slice(i).join(' | ') : (cells[i] ?? '')));
          return row;
        }),
      },
    }),
    serialize: ({ lists }) =>
      (lists.rows ?? [])
        .map((r) => columns.map((c) => cell(r[c.key])))
        .filter((cells) => cells.some(Boolean))
        .map((cells) => {
          while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
          return cells.join(' | ');
        })
        .join('\n'),
  };
}

const faqForm: BlockForm = {
  fields: [],
  lists: [
    {
      key: 'items',
      label: 'Câu hỏi',
      item: 'Câu hỏi',
      columns: [
        { key: 'q', label: 'Câu hỏi', type: 'text', placeholder: 'Người đọc hay hỏi gì?' },
        { key: 'a', label: 'Trả lời', type: 'textarea', placeholder: 'Câu trả lời ngắn gọn.' },
      ],
    },
  ],
  parse(source) {
    const items: Record<string, string>[] = [];
    const answers: string[][] = [];
    for (const line of clean(source)) {
      const q = /^\?\s*(.+)$/.exec(line.trim());
      if (q) {
        items.push({ q: q[1]!, a: '' });
        answers.push([]);
      } else if (items.length) answers[answers.length - 1]!.push(line);
    }
    items.forEach((item, i) => (item.a = joinBody(answers[i]!)));
    return { fields: {}, lists: { items } };
  },
  serialize: ({ lists }) =>
    (lists.items ?? [])
      .filter((i) => one(i.q))
      .map((i) =>
        [
          `? ${one(i.q)}`,
          // an answer line starting with "?" would be read as a new question
          text(i.a)
            .split('\n')
            .map((l) => l.replace(/^(\s*)\?/, '$1？'))
            .join('\n'),
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n'),
};

const chartForm: BlockForm = {
  hint: 'Số có thể viết 1.234,5 hoặc 1,234.5. Tối đa 24 dòng.',
  fields: [
    {
      key: 'type',
      label: 'Kiểu biểu đồ',
      type: 'select',
      options: [
        { value: 'bar', label: 'Thanh ngang' },
        { value: 'column', label: 'Cột' },
        { value: 'line', label: 'Đường' },
        { value: 'pie', label: 'Tròn' },
        { value: 'donut', label: 'Vành khuyên' },
      ],
    },
    { key: 'title', label: 'Tiêu đề', type: 'text', placeholder: 'Biểu đồ nói về điều gì?' },
    { key: 'unit', label: 'Đơn vị', type: 'text', placeholder: '%, người, triệu đồng…' },
  ],
  lists: [
    {
      key: 'rows',
      label: 'Số liệu',
      item: 'Dòng',
      columns: [
        { key: 'label', label: 'Nhãn', type: 'text', placeholder: 'Tên mục', grow: 2 },
        { key: 'value', label: 'Giá trị', type: 'text', placeholder: '0' },
      ],
    },
  ],
  parse(source) {
    const d = parseChart(source);
    // Keep the numbers exactly as typed (parseChart normalises them).
    const typed = new Map<string, string>();
    for (const raw of clean(source)) {
      const m = /^([^:]+):\s*(.*)$/.exec(raw.trim());
      if (m) typed.set(m[1]!.trim(), m[2]!.trim());
    }
    return {
      fields: { type: d.type, title: d.title, unit: d.unit },
      lists: { rows: d.points.map((p) => ({ label: p.label, value: typed.get(p.label) ?? String(p.value) })) },
    };
  },
  serialize({ fields, lists }) {
    const out = [`type: ${one(fields.type) || 'bar'}`];
    if (one(fields.title)) out.push(`title: ${one(fields.title)}`);
    if (one(fields.unit)) out.push(`unit: ${one(fields.unit)}`);
    for (const r of lists.rows ?? []) {
      // ":" separates label and value, so it cannot be part of the label
      const label = one(r.label).replace(/:/g, ' –');
      const value = one(r.value);
      if (label && value) out.push(`${label}: ${value}`);
    }
    return out.join('\n');
  },
};

const youtubeForm: BlockForm = {
  fields: [
    { key: 'url', label: 'Đường dẫn video', type: 'text', placeholder: 'https://www.youtube.com/watch?v=…' },
    { key: 'title', label: 'Tiêu đề hiển thị', type: 'text', placeholder: 'Tên video (tuỳ chọn)' },
  ],
  lists: [],
  parse(source) {
    const all = clean(source).filter((l) => l.trim());
    return { fields: { url: all[0]?.trim() ?? '', title: all.slice(1).join(' ').trim() }, lists: {} };
  },
  serialize: ({ fields }) => [one(fields.url), one(fields.title)].filter(Boolean).join('\n'),
};

const FORMS: Record<string, BlockForm> = {
  note: calloutForm,
  tip: calloutForm,
  warning: calloutForm,
  danger: calloutForm,
  success: calloutForm,
  keypoint: keypointForm,
  quote: quoteForm,
  steps: sectionsForm('Bước', 'Tên bước', 'Việc cần làm ở bước này.'),
  cards: sectionsForm('Thẻ', 'Tiêu đề thẻ', 'Mô tả ngắn.'),
  proscons: prosconsForm,
  timeline: rowsForm('Mốc', [
    { key: 'when', label: 'Thời điểm', type: 'text', placeholder: '2024' },
    { key: 'title', label: 'Tiêu đề', type: 'text', placeholder: 'Chuyện gì xảy ra', grow: 2 },
    { key: 'desc', label: 'Mô tả', type: 'text', placeholder: 'Chi tiết (tuỳ chọn)', grow: 3 },
  ]),
  flow: rowsForm('Khâu', [
    { key: 'title', label: 'Tên khâu', type: 'text', placeholder: 'Xử lý' },
    { key: 'desc', label: 'Mô tả', type: 'text', placeholder: 'Diễn ra điều gì (tuỳ chọn)', grow: 2 },
  ]),
  stats: rowsForm('Số liệu', [
    { key: 'value', label: 'Con số', type: 'text', placeholder: '98%' },
    { key: 'label', label: 'Nhãn', type: 'text', placeholder: 'Người dùng hài lòng', grow: 2 },
    { key: 'note', label: 'Ghi chú', type: 'text', placeholder: 'Nguồn, thời điểm (tuỳ chọn)', grow: 2 },
  ]),
  button: rowsForm(
    'Nút',
    [
      { key: 'label', label: 'Chữ trên nút', type: 'text', placeholder: 'Đọc thêm' },
      { key: 'url', label: 'Đường dẫn', type: 'text', placeholder: 'https://… hoặc /luu-tru/', grow: 2 },
    ],
    'Nút đầu tiên là nút chính (màu đậm).',
  ),
  faq: faqForm,
  chart: chartForm,
  youtube: youtubeForm,
};

export function blockForm(name: string): BlockForm | null {
  return FORMS[name.trim().toLowerCase()] ?? null;
}

/** A blank item for a list (every column empty). */
export function emptyItem(list: FormList): Record<string, string> {
  return Object.fromEntries(list.columns.map((c) => [c.key, '']));
}
