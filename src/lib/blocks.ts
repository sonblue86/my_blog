/**
 * "Khối nội dung" — rich blocks for plain Markdown posts: callouts, steps, pros/cons, timeline,
 * charts, flows, stats, quotes, FAQ, cards, video, button.
 *
 * A block is a fenced code block whose language is the block name:
 *
 *     ```steps
 *     # Bước một
 *     Mô tả…
 *     ```
 *
 * ONE renderer, three users — so what the author sees is what the blog shows:
 *   • the build        (src/lib/remark-blocks.ts replaces the fence with this HTML)
 *   • the visual editor (live preview under the block, src/studio/editor.ts)
 *   • the studio's "Xem trước" (src/studio/preview.ts)
 * Styles: src/styles/blocks.css (classes start with "nb-").
 *
 * SECURITY: this module turns author text into HTML that is inserted as-is. Every piece of text goes
 * through esc() / inline(); URLs through safeUrl(). Never concatenate raw input.
 * Pure TypeScript: no DOM, no Node APIs.
 */
import {
  CircleCheck,
  Info,
  Lightbulb,
  OctagonAlert,
  Play,
  Quote,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Check,
  X,
  ArrowRight,
  ExternalLink,
} from 'lucide-static';

/* ----------------------------------------------------------------- helpers */

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only links that cannot run script: http(s), mailto, site-relative, in-page. */
export function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^(?:https?:\/\/|mailto:)/i.test(u) || /^\/(?!\/)/.test(u) || u.startsWith('#')) return u;
  return null;
}

/** Inline Markdown subset on already-untrusted text: `code`, **bold**, *italic*, [text](url). */
export function inline(text: string): string {
  const codes: string[] = [];
  let out = esc(text).replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'));
      if (!href) return m;
      const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${esc(href)}"${ext}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '');
}

const lines = (src: string) => src.replace(/\r\n?/g, '\n').split('\n');
const clean = (src: string) => lines(src).map((l) => l.trimEnd());

/** Paragraphs (blank-line separated) and "- " bullet lists → HTML. */
export function rich(input: string[]): string {
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    if (list.length) html.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of input) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (bullet) {
      if (para.length) flush();
      list.push(bullet[1]!);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return html.join('');
}

/** "# Title" sections: [{ title, body[] }]. Lines before the first "# " go to a section without title. */
function sections(src: string): { title: string; body: string[] }[] {
  const out: { title: string; body: string[] }[] = [];
  for (const line of clean(src)) {
    const h = /^#{1,3}\s+(.*)$/.exec(line.trim());
    if (h) out.push({ title: h[1]!.trim(), body: [] });
    else if (out.length) out[out.length - 1]!.body.push(line);
    else if (line.trim()) out.push({ title: '', body: [line] });
  }
  return out;
}

/** "a | b | c" rows (blank lines ignored). */
const rows = (src: string) =>
  clean(src)
    .filter((l) => l.trim())
    .map((l) => l.split('|').map((c) => c.trim()));

function icon(source: string, size = 20): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(width|height)="24"/g, '')
    .replace(/class="[^"]*"/, `class="nb-icon" width="${size}" height="${size}" aria-hidden="true" focusable="false"`)
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const empty = (what: string) => `<div class="nb nb-empty">Khối “${esc(what)}” chưa có nội dung.</div>`;

/* ------------------------------------------------------------------ blocks */

const CALLOUTS = {
  note: { label: 'Ghi chú', icon: Info },
  tip: { label: 'Mẹo', icon: Lightbulb },
  warning: { label: 'Lưu ý', icon: TriangleAlert },
  danger: { label: 'Cảnh báo', icon: OctagonAlert },
  success: { label: 'Kết quả', icon: CircleCheck },
} as const;
type CalloutKind = keyof typeof CALLOUTS;

function callout(kind: CalloutKind, src: string): string {
  const all = clean(src);
  const first = all.findIndex((l) => l.trim());
  if (first < 0) return empty(CALLOUTS[kind].label);
  const h = /^#{1,3}\s+(.*)$/.exec(all[first]!.trim());
  const title = h ? h[1]!.trim() : CALLOUTS[kind].label;
  const body = rich(h ? all.slice(first + 1) : all);
  return `<div class="nb nb-callout" data-type="${kind}" role="note"><span class="nb-callout-icon">${icon(CALLOUTS[kind].icon)}</span><div class="nb-callout-content"><p class="nb-callout-title">${inline(title)}</p>${body ? `<div class="nb-callout-body">${body}</div>` : ''}</div></div>`;
}

function steps(src: string): string {
  const items = sections(src);
  if (!items.length) return empty('Các bước');
  return `<ol class="nb nb-steps">${items
    .map((s) => `<li>${s.title ? `<p class="nb-step-title">${inline(s.title)}</p>` : ''}${rich(s.body)}</li>`)
    .join('')}</ol>`;
}

function proscons(src: string): string {
  let prosTitle = 'Ưu điểm';
  let consTitle = 'Nhược điểm';
  const pros: string[] = [];
  const cons: string[] = [];
  let current: string[] | null = null; // the list the last item went to (for wrapped lines)
  for (const raw of clean(src)) {
    const line = raw.trim();
    const h = /^#{1,3}\s+(.*)$/.exec(line);
    if (h) {
      const [a, b] = h[1]!.split('|').map((s) => s.trim());
      if (a) prosTitle = a;
      if (b) consTitle = b;
    } else if (line.startsWith('+')) {
      pros.push(line.slice(1).trim());
      current = pros;
    } else if (/^[-–−]/.test(line)) {
      cons.push(line.slice(1).trim());
      current = cons;
    } else if (line && current) {
      current[current.length - 1] += ` ${line}`;
    }
  }
  if (!pros.length && !cons.length) return empty('Ưu / nhược điểm');
  const col = (kind: 'pros' | 'cons', title: string, items: string[], badge: string, mark: string) =>
    items.length
      ? `<div class="nb-pc-col" data-kind="${kind}"><p class="nb-pc-title"><span class="nb-pc-badge">${icon(badge, 16)}</span>${inline(title)}</p><ul>${items
          .map((i) => `<li><span class="nb-pc-mark">${icon(mark, 16)}</span><span>${inline(i)}</span></li>`)
          .join('')}</ul></div>`
      : '';
  return `<div class="nb nb-pc">${col('pros', prosTitle, pros, ThumbsUp, Check)}${col('cons', consTitle, cons, ThumbsDown, X)}</div>`;
}

function timeline(src: string): string {
  const items = rows(src);
  if (!items.length) return empty('Dòng thời gian');
  return `<ol class="nb nb-timeline">${items
    .map(([when = '', title = '', ...rest]) => {
      const desc = rest.join(' | ');
      return `<li><span class="nb-tl-when">${inline(when)}</span><div class="nb-tl-body">${title ? `<p class="nb-tl-title">${inline(title)}</p>` : ''}${desc ? `<p>${inline(desc)}</p>` : ''}</div></li>`;
    })
    .join('')}</ol>`;
}

function flow(src: string): string {
  const items = rows(src);
  if (!items.length) return empty('Quy trình');
  return `<ol class="nb nb-flow">${items
    .map(
      ([title = '', ...rest], i) =>
        `<li><span class="nb-flow-num">${i + 1}</span><p class="nb-flow-title">${inline(title)}</p>${rest.length ? `<p class="nb-flow-desc">${inline(rest.join(' | '))}</p>` : ''}<span class="nb-flow-arrow">${icon(ArrowRight, 18)}</span></li>`,
    )
    .join('')}</ol>`;
}

function stats(src: string): string {
  const items = rows(src);
  if (!items.length) return empty('Số liệu nổi bật');
  return `<div class="nb nb-stats">${items
    .map(([value = '', label = '', note = '']) => `<div class="nb-stat"><p class="nb-stat-value">${inline(value)}</p>${label ? `<p class="nb-stat-label">${inline(label)}</p>` : ''}${note ? `<p class="nb-stat-note">${inline(note)}</p>` : ''}</div>`)
    .join('')}</div>`;
}

function keypoint(src: string): string {
  const body = rich(clean(src));
  if (!body) return empty('Ý chính');
  return `<div class="nb nb-keypoint"><span class="nb-keypoint-icon">${icon(Sparkles, 22)}</span><div>${body}</div></div>`;
}

function quote(src: string): string {
  const all = clean(src).filter((l) => l.trim());
  if (!all.length) return empty('Trích dẫn');
  const last = all[all.length - 1]!.trim();
  const by = /^[—–-]{1,2}\s*(.+)$/.exec(last);
  const text = by ? all.slice(0, -1) : all;
  if (!text.length) return empty('Trích dẫn');
  return `<figure class="nb nb-quote"><span class="nb-quote-icon">${icon(Quote, 28)}</span><blockquote>${rich(text)}</blockquote>${by ? `<figcaption>${inline(by[1]!)}</figcaption>` : ''}</figure>`;
}

function faq(src: string): string {
  const items: { q: string; a: string[] }[] = [];
  for (const line of clean(src)) {
    const q = /^\?\s*(.+)$/.exec(line.trim());
    if (q) items.push({ q: q[1]!, a: [] });
    else if (items.length) items[items.length - 1]!.a.push(line);
  }
  if (!items.length) return empty('Hỏi – đáp');
  return `<div class="nb nb-faq">${items.map((i) => `<details><summary>${inline(i.q)}</summary><div class="nb-faq-a">${rich(i.a)}</div></details>`).join('')}</div>`;
}

function cards(src: string): string {
  const items = sections(src).filter((s) => s.title || s.body.some((l) => l.trim()));
  if (!items.length) return empty('Thẻ');
  return `<div class="nb nb-cards">${items.map((s) => `<div class="nb-card">${s.title ? `<p class="nb-card-title">${inline(s.title)}</p>` : ''}${rich(s.body)}</div>`).join('')}</div>`;
}

export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1]! : null;
}

function youtube(src: string): string {
  const all = clean(src).filter((l) => l.trim());
  const id = all.length ? youtubeId(all[0]!) : null;
  if (!id) return `<div class="nb nb-empty">Khối “Video YouTube”: dòng đầu cần là đường dẫn video YouTube.</div>`;
  const title = all.slice(1).join(' ').trim() || 'Video trên YouTube';
  return `<a class="nb nb-youtube" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360"><span class="nb-youtube-play">${icon(Play, 28)}</span><span class="nb-youtube-title">${inline(title)}<small>Xem trên YouTube ${icon(ExternalLink, 14)}</small></span></a>`;
}

function button(src: string): string {
  const links = rows(src)
    .map(([label = '', url = '']) => ({ label, href: safeUrl(url) }))
    .filter((b): b is { label: string; href: string } => Boolean(b.label && b.href));
  if (!links.length) return `<div class="nb nb-empty">Khối “Nút bấm”: mỗi dòng theo mẫu “Nhãn nút | https://…”.</div>`;
  return `<p class="nb nb-buttons">${links
    .map((b, i) => {
      const ext = /^https?:/i.test(b.href) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a class="nb-button" data-variant="${i === 0 ? 'primary' : 'ghost'}" href="${esc(b.href)}"${ext}>${inline(b.label)}</a>`;
    })
    .join('')}</p>`;
}

/* ------------------------------------------------------------------- chart */

export type ChartType = 'bar' | 'column' | 'line' | 'pie' | 'donut';
export interface ChartData {
  type: ChartType;
  title: string;
  unit: string;
  points: { label: string; value: number }[];
}

const CHART_TYPES: Record<string, ChartType> = {
  bar: 'bar', 'thanh-ngang': 'bar', ngang: 'bar',
  column: 'column', cot: 'column', 'cột': 'column',
  line: 'line', duong: 'line', 'đường': 'line',
  pie: 'pie', tron: 'pie', 'tròn': 'pie',
  donut: 'donut', vanh: 'donut', 'vành': 'donut',
};

/** "1.234,5" / "1,234.5" / "45%" → number. */
export function parseNumber(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{3}(?:,|$)/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  return Number.parseFloat(s);
}

export function parseChart(src: string): ChartData {
  const data: ChartData = { type: 'bar', title: '', unit: '', points: [] };
  for (const raw of clean(src)) {
    const m = /^([^:]+):\s*(.*)$/.exec(raw.trim());
    if (!m) continue;
    const key = m[1]!.trim();
    const value = m[2]!.trim();
    const k = key.toLowerCase();
    if (k === 'type' || k === 'loại' || k === 'loai') data.type = CHART_TYPES[value.toLowerCase()] ?? 'bar';
    else if (k === 'title' || k === 'tiêu đề' || k === 'tieu de') data.title = value;
    else if (k === 'unit' || k === 'đơn vị' || k === 'don vi') data.unit = value;
    else {
      const n = parseNumber(value);
      if (Number.isFinite(n)) data.points.push({ label: key, value: n });
    }
  }
  data.points = data.points.slice(0, 24);
  return data;
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

function chart(src: string): string {
  const d = parseChart(src);
  if (!d.points.length) return `<div class="nb nb-empty">Khối “Biểu đồ” cần ít nhất một dòng số liệu theo mẫu “Nhãn: 12”.</div>`;
  const unit = d.unit ? (/^[%°]/.test(d.unit) ? esc(d.unit) : ` ${esc(d.unit)}`) : '';
  const val = (n: number) => `${fmt(n)}${unit}`;
  const max = Math.max(...d.points.map((p) => p.value), 0) || 1;
  const caption = d.title ? `<figcaption class="nb-chart-title">${inline(d.title)}</figcaption>` : '';
  const label = `${d.title || 'Biểu đồ'}: ${d.points.map((p) => `${p.label} ${val(p.value)}`).join('; ')}`;
  let body = '';

  if (d.type === 'bar') {
    body = `<div class="nb-bars">${d.points
      .map((p, i) => `<div class="nb-bar-row"><span class="nb-bar-label">${inline(p.label)}</span><span class="nb-bar-track"><span class="nb-bar-fill" data-c="${i % 6}" style="width:${r2((Math.max(p.value, 0) / max) * 100)}%"></span></span><span class="nb-bar-value">${val(p.value)}</span></div>`)
      .join('')}</div>`;
  } else if (d.type === 'column') {
    body = `<div class="nb-cols">${d.points
      .map((p, i) => `<div class="nb-col"><span class="nb-col-value">${val(p.value)}</span><span class="nb-col-bar" data-c="${i % 6}" style="height:${r2((Math.max(p.value, 0) / max) * 100)}%"></span><span class="nb-col-label">${inline(p.label)}</span></div>`)
      .join('')}</div>`;
  } else if (d.type === 'line') {
    const W = 600;
    const H = 240;
    const padX = 28;
    const padTop = 28;
    const padBottom = 34;
    const min = Math.min(...d.points.map((p) => p.value), 0);
    const span = max - min || 1;
    const n = d.points.length;
    const x = (i: number) => r2(n === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1));
    const y = (v: number) => r2(padTop + (1 - (v - min) / span) * (H - padTop - padBottom));
    const pts = d.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
    const area = `${x(0)},${H - padBottom} ${pts} ${x(n - 1)},${H - padBottom}`;
    const grid = [0, 0.5, 1].map((t) => `<line class="nb-line-grid" x1="${padX}" x2="${W - padX}" y1="${r2(padTop + t * (H - padTop - padBottom))}" y2="${r2(padTop + t * (H - padTop - padBottom))}"/>`).join('');
    const step = Math.ceil(n / 8);
    body = `<svg class="nb-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}<polygon class="nb-line-area" points="${area}"/><polyline class="nb-line-path" points="${pts}"/>${d.points
      .map((p, i) => `<circle class="nb-line-dot" cx="${x(i)}" cy="${y(p.value)}" r="4"><title>${esc(`${p.label}: ${val(p.value)}`)}</title></circle>${n <= 12 ? `<text class="nb-line-value" x="${x(i)}" y="${r2(y(p.value) - 10)}" text-anchor="middle">${esc(val(p.value))}</text>` : ''}${i % step === 0 ? `<text class="nb-line-label" x="${x(i)}" y="${H - 10}" text-anchor="middle">${esc(p.label)}</text>` : ''}`)
      .join('')}</svg>`;
  } else {
    const total = d.points.reduce((s, p) => s + Math.max(p.value, 0), 0) || 1;
    const R = 15.915; // circumference = 100 → dash lengths are percentages
    let offset = 25; // start at 12 o'clock
    const segs = d.points
      .map((p, i) => {
        const pct = (Math.max(p.value, 0) / total) * 100;
        const seg = `<circle class="nb-pie-seg" data-c="${i % 6}" cx="21" cy="21" r="${R}" stroke-dasharray="${r2(pct)} ${r2(100 - pct)}" stroke-dashoffset="${r2(offset)}"><title>${esc(`${p.label}: ${val(p.value)} (${fmt(r2(pct))}%)`)}</title></circle>`;
        offset -= pct;
        return seg;
      })
      .join('');
    const legend = d.points
      .map((p, i) => `<li><span class="nb-dot" data-c="${i % 6}"></span><span>${inline(p.label)}</span><strong>${val(p.value)}</strong><small>${fmt(Math.round((Math.max(p.value, 0) / total) * 100))}%</small></li>`)
      .join('');
    body = `<div class="nb-pie-wrap"><svg class="nb-pie" data-kind="${d.type}" viewBox="0 0 42 42" role="img" aria-label="${esc(label)}">${segs}</svg><ul class="nb-legend">${legend}</ul></div>`;
  }
  return `<figure class="nb nb-chart" data-type="${d.type}">${caption}${body}</figure>`;
}

/* ---------------------------------------------------------------- registry */

export interface BlockDef {
  /** Language of the fenced code block. */
  name: string;
  label: string;
  /** One line shown in the editor's block gallery. */
  description: string;
  group: 'Nhấn mạnh' | 'Trình bày' | 'Số liệu' | 'Nhúng';
  /** Starter content inserted by the editor. */
  template: string;
  render: (source: string) => string;
}

const calloutDef = (kind: CalloutKind, description: string, template: string): BlockDef => ({
  name: kind,
  label: CALLOUTS[kind].label,
  description,
  group: 'Nhấn mạnh',
  template,
  render: (src) => callout(kind, src),
});

export const BLOCKS: BlockDef[] = [
  calloutDef('note', 'Hộp thông tin bổ sung, giải thích thêm.', '# Ghi chú\nThông tin bổ sung cho người đọc. Dùng **in đậm** hoặc [liên kết](https://example.com) nếu cần.'),
  calloutDef('tip', 'Mẹo hay, cách làm nhanh hơn.', '# Mẹo nhỏ\nMột mẹo giúp người đọc làm nhanh hoặc dễ hơn.'),
  calloutDef('warning', 'Điều cần chú ý trước khi làm.', '# Lưu ý\nĐiều người đọc cần biết trước khi làm theo.'),
  calloutDef('danger', 'Rủi ro nghiêm trọng, việc không nên làm.', '# Cảnh báo\nViệc có thể gây mất dữ liệu hoặc hậu quả khó sửa.'),
  calloutDef('success', 'Kết quả đạt được, điều đã kiểm chứng.', '# Kết quả\nĐiều bạn sẽ có sau khi làm xong.'),
  {
    name: 'keypoint',
    label: 'Ý chính',
    description: 'Một câu quan trọng nhất, làm nổi bật giữa bài.',
    group: 'Nhấn mạnh',
    template: 'Viết ở đây **một ý quan trọng nhất** mà bạn muốn người đọc nhớ.',
    render: keypoint,
  },
  {
    name: 'quote',
    label: 'Trích dẫn',
    description: 'Câu trích lớn kèm tên người nói.',
    group: 'Nhấn mạnh',
    template: 'Sự đơn giản là đỉnh cao của tinh tế.\n— Leonardo da Vinci',
    render: quote,
  },
  {
    name: 'steps',
    label: 'Các bước',
    description: 'Hướng dẫn từng bước, có số thứ tự và đường nối.',
    group: 'Trình bày',
    template: '# Bước đầu tiên\nMô tả việc cần làm ở bước này.\n\n# Bước thứ hai\nMô tả tiếp theo. Có thể dùng `mã` hoặc **in đậm**.\n\n# Hoàn tất\nKết quả người đọc nhận được.',
    render: steps,
  },
  {
    name: 'proscons',
    label: 'Ưu / nhược điểm',
    description: 'Hai cột so sánh điểm mạnh và điểm yếu.',
    group: 'Trình bày',
    template: '+ Ưu điểm thứ nhất\n+ Ưu điểm thứ hai\n- Nhược điểm thứ nhất\n- Nhược điểm thứ hai',
    render: proscons,
  },
  {
    name: 'timeline',
    label: 'Dòng thời gian',
    description: 'Các mốc theo thời gian: năm | tiêu đề | mô tả.',
    group: 'Trình bày',
    template: '2017 | Mốc thứ nhất | Mô tả ngắn về sự kiện.\n2020 | Mốc thứ hai | Mô tả ngắn về sự kiện.\n2024 | Mốc thứ ba | Mô tả ngắn về sự kiện.',
    render: timeline,
  },
  {
    name: 'flow',
    label: 'Quy trình',
    description: 'Chuỗi các khâu nối nhau bằng mũi tên.',
    group: 'Trình bày',
    template: 'Đầu vào | Dữ liệu người dùng gửi lên\nXử lý | Hệ thống phân tích\nKết quả | Trả lời cho người dùng',
    render: flow,
  },
  {
    name: 'cards',
    label: 'Thẻ',
    description: 'Lưới các thẻ nhỏ: tiêu đề + mô tả.',
    group: 'Trình bày',
    template: '# Thẻ thứ nhất\nMô tả ngắn.\n\n# Thẻ thứ hai\nMô tả ngắn.\n\n# Thẻ thứ ba\nMô tả ngắn.',
    render: cards,
  },
  {
    name: 'faq',
    label: 'Hỏi – đáp',
    description: 'Câu hỏi bấm để mở câu trả lời.',
    group: 'Trình bày',
    template: '? Câu hỏi thứ nhất?\nCâu trả lời cho câu hỏi thứ nhất.\n\n? Câu hỏi thứ hai?\nCâu trả lời cho câu hỏi thứ hai.',
    render: faq,
  },
  {
    name: 'chart',
    label: 'Biểu đồ',
    description: 'Thanh ngang, cột, đường, tròn hoặc vành khuyên từ số liệu.',
    group: 'Số liệu',
    template: 'type: bar\ntitle: Tiêu đề biểu đồ\nunit: %\nMục A: 62\nMục B: 45\nMục C: 28',
    render: chart,
  },
  {
    name: 'stats',
    label: 'Số liệu nổi bật',
    description: 'Các con số lớn kèm chú thích: số | nhãn | ghi chú.',
    group: 'Số liệu',
    template: '98% | Người dùng hài lòng | khảo sát 2026\n3× | Nhanh hơn | so với cách cũ\n0đ | Chi phí vận hành',
    render: stats,
  },
  {
    name: 'youtube',
    label: 'Video YouTube',
    description: 'Ảnh xem trước của video, bấm để mở trên YouTube.',
    group: 'Nhúng',
    template: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ\nTiêu đề video',
    render: youtube,
  },
  {
    name: 'button',
    label: 'Nút bấm',
    description: 'Nút dẫn tới một đường link: nhãn | đường dẫn.',
    group: 'Nhúng',
    template: 'Xem mã nguồn | https://github.com/\nĐọc thêm | /luu-tru/',
    render: button,
  },
];

const BY_NAME = new Map(BLOCKS.map((b) => [b.name, b]));

export function isBlock(lang: string | null | undefined): boolean {
  return typeof lang === 'string' && BY_NAME.has(lang.trim().toLowerCase());
}

/** HTML for a block, or null when `lang` is an ordinary code language. */
export function renderBlock(lang: string | null | undefined, source: string): string | null {
  const def = typeof lang === 'string' ? BY_NAME.get(lang.trim().toLowerCase()) : undefined;
  return def ? def.render(source) : null;
}

/** The Markdown the editor inserts for a block. */
export function blockMarkdown(name: string): string {
  const def = BY_NAME.get(name);
  return def ? `\`\`\`${def.name}\n${def.template}\n\`\`\`` : '';
}
