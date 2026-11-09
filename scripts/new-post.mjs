#!/usr/bin/env node
// @ts-check
/**
 * Tạo khung bài viết mới:  npm run new -- "Tiêu đề bài viết" [--category ai|cong-nghe|doi-song] [--mdx] [--tags "A, B"]
 * Thiếu tiêu đề/chuyên mục thì script hỏi từng bước. Không bao giờ ghi đè bài đã có.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';
import {
  CATEGORIES,
  USAGE,
  buildPost,
  findConflicts,
  normalizeCategory,
  parseArgs,
  parseTags,
  postFilePath,
  slugify,
  todayIn,
} from './lib/new-post-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** @param {Parameters<typeof styleText>[0]} style @param {string} text */
const paint = (style, text) => styleText(style, text, { stream: process.stdout });

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`${styleText('red', '✗', { stream: process.stderr })} ${message}`);
  process.exit(1);
}

function cancelled() {
  console.log('\nĐã huỷ — không có file nào được tạo.');
  process.exit(130);
}

/** @type {import('node:readline').Interface | undefined} */
let rl;
/** @type {AsyncIterator<string> | undefined} */
let lines;
/**
 * Hỏi một câu và chờ một dòng trả lời. Dùng async iterator thay vì rl.question() để không mất dòng
 * khi nhiều dòng đến cùng lúc (dán/pipe) và để Ctrl+D (hết input) huỷ gọn thay vì treo.
 * @param {string} question
 */
async function ask(question) {
  if (!rl || !lines) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', cancelled);
    lines = rl[Symbol.asyncIterator]();
  }
  rl.setPrompt(question);
  rl.prompt();
  const { value, done } = await lines.next();
  if (done) cancelled();
  return String(value).trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.errors.length) fail(`${args.errors.join(' ')}\n\n${USAGE}`);

  // 1. Tiêu đề
  let title = args.title;
  if (!title) {
    if (!interactive) fail(`Bạn chưa nhập tiêu đề bài viết.\n\n${USAGE}`);
    for (let tries = 0; !title && tries < 3; tries++) {
      title = await ask(paint('bold', 'Tiêu đề bài viết: '));
    }
    if (!title) fail('Cần có tiêu đề để tạo bài.');
  }

  // 2. Chuyên mục
  let category = normalizeCategory(args.category);
  if (args.category !== undefined && !category) {
    fail(`Chuyên mục "${args.category}" không có. Chọn một trong: ${CATEGORIES.map((c) => c.id).join(', ')}.`);
  }
  if (!category) {
    if (!interactive) fail('Bạn chưa chọn chuyên mục: thêm --category ai | cong-nghe | doi-song.');
    console.log(paint('bold', 'Chọn chuyên mục:'));
    CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} ${paint('dim', `(${c.id})`)}`));
    for (let tries = 0; !category && tries < 3; tries++) {
      const answer = await ask('Nhập số hoặc tên chuyên mục: ');
      category = normalizeCategory(answer);
      if (!category) console.log(paint('yellow', '  Chưa đúng — thử lại nhé (ví dụ: 1 hoặc ai).'));
    }
    if (!category) fail('Chưa chọn được chuyên mục.');
  }

  // 3. Thẻ (chỉ hỏi khi đang ở chế độ hỏi đáp)
  let tags = args.tags;
  if (!tags.length && rl) {
    tags = parseTags(await ask(`Thẻ ${paint('dim', '(cách nhau bằng dấu phẩy, Enter để bỏ qua)')}: `));
  }
  rl?.close();

  // 4. Tạo file
  const slug = slugify(title);
  if (!slug) fail('Tiêu đề cần có ít nhất một chữ cái hoặc chữ số (a–z, 0–9) để tạo đường dẫn.');

  const content = buildPost({ title, category, tags, date: todayIn(), mdx: args.mdx });
  const relPath = postFilePath(slug, args.mdx);

  if (args.dryRun) {
    console.log(paint('dim', `# ${relPath} (dry run — không ghi file)`));
    console.log(content);
    return;
  }

  const conflicts = findConflicts(slug, (p) => existsSync(join(ROOT, p)));
  if (conflicts.length) {
    fail(
      `Đã có bài với đường dẫn "${slug}": ${conflicts.join(', ')}\n` +
        '  Script không ghi đè bài cũ. Hãy đổi tiêu đề, hoặc mở bài đó ra sửa trực tiếp.',
    );
  }

  const absPath = join(ROOT, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  // flag "wx": thất bại nếu file đã tồn tại (chống ghi đè cả khi có tiến trình khác vừa tạo).
  writeFileSync(absPath, content, { encoding: 'utf8', flag: 'wx' });

  const catInfo = CATEGORIES.find((c) => c.id === category);
  console.log(`\n${paint('green', '✓')} Đã tạo bài nháp ${paint('bold', `"${title}"`)} (${catInfo?.name})`);
  console.log(`  ${paint('cyan', relPath)}\n`);
  console.log(paint('bold', 'Bước tiếp theo:'));
  console.log(`  1. Mở file trên và viết nội dung; thay các dòng có chữ ${paint('yellow', 'TODO')} (mô tả, tóm tắt, ý chính).`);
  console.log(`  2. Ảnh của bài: chép vào ${paint('cyan', `${dirname(relPath)}/`)} rồi chèn ![Mô tả](./ten-anh.jpg).`);
  console.log(`  3. Xem trước: ${paint('cyan', 'npm run dev')} → http://localhost:4321/bai-viet/${slug}/`);
  console.log(`  4. Sẵn sàng đăng: đổi ${paint('yellow', 'draft: true')} thành ${paint('green', 'draft: false')}, rồi commit & push.`);
  console.log(paint('dim', '  Hướng dẫn viết bài chi tiết: docs/WRITING.md'));
}

main().catch((error) => {
  rl?.close();
  if (error && /** @type {{ code?: string }} */ (error).code === 'ABORT_ERR') process.exit(130);
  fail(error instanceof Error ? error.message : String(error));
});
