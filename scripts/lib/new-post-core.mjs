// @ts-check
/**
 * Phần lõi (thuần, không I/O) của `npm run new` — tạo khung bài viết mới.
 * Tách riêng để unit test được: tests/unit/newpost.test.ts.
 */

/** Phải khớp với `category` trong src/content.config.ts và CATEGORIES trong src/config.ts. */
export const CATEGORIES = /** @type {const} */ ([
  { id: 'ai', name: 'AI' },
  { id: 'cong-nghe', name: 'Công nghệ' },
  { id: 'doi-song', name: 'Đời sống' },
]);

/** @typedef {(typeof CATEGORIES)[number]['id']} CategoryId */

/** Cùng giới hạn với `slug.maxlength` trong public/admin/config.yml. */
export const SLUG_MAX_LENGTH = 80;

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const POSTS_DIR = 'src/content/posts';

/**
 * "Đây là Tiêu đề!" -> "day-la-tieu-de". Cùng thuật toán với `slugify()` trong src/lib/text.ts
 * (test đối chiếu để hai bản không lệch nhau), thêm giới hạn độ dài: cắt ở ranh giới từ.
 * @param {string} input
 * @param {number} [maxLength]
 */
export function slugify(input, maxLength = SLUG_MAX_LENGTH) {
  let slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > maxLength) {
    // Cắt ở dấu "-" cuối cùng trong giới hạn để không cụt giữa một từ.
    const cut = slug.lastIndexOf('-', maxLength);
    slug = slug.slice(0, cut > 0 ? cut : maxLength).replace(/-+$/g, '');
  }
  return slug;
}

/**
 * Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (không phụ thuộc múi giờ của máy).
 * @param {Date} [now]
 * @param {string} [timeZone]
 */
export function todayIn(now = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  /** @param {string} type */
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Chuỗi YAML an toàn: luôn đặt trong nháy đơn, nháy đơn bên trong nhân đôi.
 * Nhờ vậy tiêu đề có dấu hai chấm, dấu #, nháy kép, "yes/no"... vẫn được đọc đúng là chuỗi.
 * @param {string} value
 */
export function yamlString(value) {
  const oneLine = String(value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  return `'${oneLine.replace(/'/g, "''")}'`;
}

/**
 * "AI, Năng suất,  ai , " -> ["AI", "Năng suất"] — bỏ trống, bỏ trùng (không phân biệt hoa/thường, dấu).
 * @param {string | string[] | undefined} input
 * @returns {string[]}
 */
export function parseTags(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input.flatMap((s) => s.split(',')) : input.split(',');
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const item of raw) {
    const tag = item.replace(/\s+/g, ' ').trim();
    const key = slugify(tag, 200);
    if (tag && key && !seen.has(key)) seen.set(key, tag);
  }
  return [...seen.values()];
}

/**
 * Nhận "ai", "cong-nghe", "Công nghệ", "cong nghe", "2"... -> id chuyên mục, hoặc null nếu không hợp lệ.
 * @param {string | undefined | null} input
 * @returns {CategoryId | null}
 */
export function normalizeCategory(input) {
  if (input == null) return null;
  const value = String(input).trim();
  if (!value) return null;
  const index = Number(value);
  if (Number.isInteger(index) && index >= 1 && index <= CATEGORIES.length) return CATEGORIES[index - 1].id;
  const key = slugify(value, 200);
  const found = CATEGORIES.find((c) => c.id === key || slugify(c.name, 200) === key);
  return found ? found.id : null;
}

/**
 * @typedef {object} ParsedArgs
 * @property {string | undefined} title
 * @property {string | undefined} category  Giá trị thô người dùng nhập (chưa chuẩn hoá).
 * @property {string[]} tags
 * @property {boolean} mdx
 * @property {boolean} dryRun
 * @property {boolean} help
 * @property {string[]} errors
 */

/**
 * Đọc tham số dòng lệnh. Hỗ trợ: "Tiêu đề" (hoặc nhiều từ không đặt trong nháy),
 * --category/-c <id>, --tags/-t "A, B", --mdx, --dry-run, --help/-h, và dạng --tên=giá-trị.
 * @param {string[]} argv
 * @returns {ParsedArgs}
 */
export function parseArgs(argv) {
  /** @type {ParsedArgs} */
  const out = { title: undefined, category: undefined, tags: [], mdx: false, dryRun: false, help: false, errors: [] };
  /** @type {string[]} */
  const words = [];
  /** @type {string[]} */
  const tagInputs = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      words.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      words.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    /** Lấy giá trị của cờ: "--x=v" hoặc "--x v". */
    const takeValue = () => {
      if (eq !== -1) return arg.slice(eq + 1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.errors.push(`Thiếu giá trị cho ${name}.`);
        return undefined;
      }
      i++;
      return next;
    };
    switch (name) {
      case '--category':
      case '-c':
        out.category = takeValue();
        break;
      case '--tags':
      case '--tag':
      case '-t': {
        const v = takeValue();
        if (v !== undefined) tagInputs.push(v);
        break;
      }
      case '--mdx':
        out.mdx = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--help':
      case '-h':
        out.help = true;
        break;
      default:
        out.errors.push(`Không hiểu tuỳ chọn "${arg}".`);
    }
  }
  const title = words.join(' ').replace(/\s+/g, ' ').trim();
  out.title = title || undefined;
  out.tags = parseTags(tagInputs);
  return out;
}

/**
 * Các đường dẫn sẽ trùng với bài mới (thư mục <slug>/ hoặc file <slug>.md/.mdx đã có).
 * @param {string} slug
 * @param {(relativePath: string) => boolean} exists
 */
export function findConflicts(slug, exists) {
  return [`${POSTS_DIR}/${slug}`, `${POSTS_DIR}/${slug}.md`, `${POSTS_DIR}/${slug}.mdx`].filter((p) => exists(p));
}

/**
 * @param {string} slug
 * @param {boolean} mdx
 */
export function postFilePath(slug, mdx) {
  return `${POSTS_DIR}/${slug}/index.${mdx ? 'mdx' : 'md'}`;
}

/**
 * Nội dung file bài viết mới: frontmatter đầy đủ (khớp src/content.config.ts) + khung thân bài.
 * Luôn là bản nháp (draft: true) để không lỡ xuất bản khi chưa viết xong.
 * @param {{ title: string, category: CategoryId, tags?: string[], date: string, mdx?: boolean }} opts
 */
export function buildPost({ title, category, tags = [], date, mdx = false }) {
  const tagLine = tags.length ? `[${tags.map(yamlString).join(', ')}]` : '[]';
  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    "description: 'TODO: Mô tả ngắn 120–160 ký tự — bài viết giúp người đọc điều gì? Hiện trên Google và khi chia sẻ.'",
    `pubDate: ${date}`,
    `category: ${category}`,
    `tags: ${tagLine}`,
    '# Bản nháp: chỉ hiện khi chạy `npm run dev`. Đổi thành false khi sẵn sàng xuất bản.',
    'draft: true',
    "summary: 'TODO: 1–3 câu tóm tắt nhanh (TL;DR) hiện ở đầu bài.'",
    'takeaways:',
    "  - 'TODO: Ý chính thứ nhất'",
    "  - 'TODO: Ý chính thứ hai'",
    "  - 'TODO: Ý chính thứ ba'",
    '# ── Tuỳ chọn: xoá dấu # ở đầu dòng để dùng ──',
    '# Hẹn giờ đăng: đặt pubDate trong tương lai, ví dụ pubDate: 2026-12-01T08:00:00+07:00',
    `# updatedDate: ${date}`,
    '# cover: ./cover.jpg        # ảnh đặt cùng thư mục với bài; bỏ trống = ảnh bìa tự sinh',
    "# coverAlt: 'Mô tả ngắn nội dung ảnh bìa'",
    '# author: nhip-so           # id tác giả trong src/content/authors/',
    "# series: 'Tên series'",
    '# seriesOrder: 1',
    '# featured: true            # ghim lên vị trí nổi bật ở trang chủ',
    '# comments: false           # tắt bình luận cho riêng bài này',
    '---',
  ].join('\n');

  const note = mdx
    ? "{/* Bài MDX: dùng được component trong src/components/mdx/index.ts mà không cần import. Xoá ghi chú này khi viết. */}"
    : '<!-- Dùng ## và ### cho các mục — mục lục được tạo tự động. Xoá ghi chú này khi viết. -->';

  const body = [
    note,
    '',
    'Mở bài: một đoạn ngắn nêu vấn đề và điều người đọc sẽ nhận được sau khi đọc xong.',
    '',
    '## Ý chính thứ nhất',
    '',
    'Nội dung…',
    '',
    '## Ý chính thứ hai',
    '',
    'Nội dung…',
    '',
    '## Kết luận',
    '',
    'Tóm lại điều quan trọng nhất và gợi ý bước tiếp theo cho người đọc.',
    '',
  ].join('\n');

  return `${frontmatter}\n\n${body}`;
}

export const USAGE = `Tạo bài viết mới (bản nháp):

  npm run new -- "Tiêu đề bài viết" [tuỳ chọn]

Tuỳ chọn:
  -c, --category <id>   Chuyên mục: ${CATEGORIES.map((c) => `${c.id} (${c.name})`).join(', ')}
  -t, --tags "A, B"     Thẻ, cách nhau bằng dấu phẩy
      --mdx             Tạo file .mdx (dùng được component) thay vì .md
      --dry-run         Chỉ in nội dung ra màn hình, không ghi file
  -h, --help            Xem hướng dẫn này

Ví dụ:
  npm run new -- "Prompt hiệu quả cho người mới" --category ai --tags "Prompt, ChatGPT"
  npm run new                (hỏi tiêu đề và chuyên mục từng bước)`;
