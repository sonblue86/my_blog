# Tiến độ — agent "docs" (branch feat/docs)

Phạm vi: Sveltia CMS (`public/admin/**`), `scripts/new-post.mjs` + `scripts/lib/**`, unit tests
(`tests/unit/{posts,date,newpost}*.test.ts`), `README.md` + `LICENSE`, `.github/**`.

## Done
- [x] Sveltia CMS: `public/admin/index.html` + `public/admin/config.yml`. Đã kiểm tra: YAML parse OK; hợp lệ theo
  JSON schema chính thức @sveltia/cms 0.262.1 (ajv, schema strict additionalProperties=false; thử case sai → bị bắt);
  khớp mọi trường zod của posts/authors trừ `slug` (cố ý). Build thử xác nhận `cover: sample.jpg` (không có `./`,
  đúng dạng CMS ghi ra) và avatar JSON đều được Astro `image()` nhận và tối ưu.

- [x] `npm run new`: `scripts/new-post.mjs` + `scripts/lib/new-post-core.mjs` + `tests/unit/newpost.test.ts` (43 test,
  round-trip qua `parseFrontmatter` của Astro; mutation test: bỏ quoting → 9 test fail). Đã chạy thật: tạo .md + .mdx,
  build thành công (tiêu đề có `"`, `:` giữ nguyên; comment MDX không lộ ra), từ chối ghi đè (exit 1), hỏi đáp mô phỏng
  TTY (nhập sai chuyên mục → hỏi lại; Ctrl+D → huỷ exit 130). Có thêm `--dry-run`.

- [x] `tests/unit/posts.test.ts` (13: relatedPosts điểm/tie-break/limit/thẻ bỏ dấu, seriesPosts thứ tự, isPublished
  draft + hẹn giờ qua vi.stubEnv('DEV'), getTags/getSeries qua getCollection mock) và `tests/unit/date.test.ts`
  (timeAgo với now inject, formatDate qua nửa đêm UTC+7, giao thừa). Toàn bộ: 74 pass + 1 expected fail.
  BUG phát hiện: `timeAgo` trả "Hôm qua"/"Hôm kia" viết hoa (CLDR) → "· cập nhật Hôm qua" giữa câu; và
  `Math.round` cho "60 phút trước"/"24 giờ trước". Fix đã thử ở scratchpad (trunc + hạ chữ đầu) → ghi vào integrationNotes.
  Test casing để `it.fails` — khi integrator sửa src/lib/date.ts thì đổi thành `it`.

- [x] `.github/workflows/ci.yml` (push main + PR: npm ci → check → test → build) và `scheduled-deploy.yml` (cron
  `0 23 * * *` = 06:00 VN + workflow_dispatch → build → `npx wrangler deploy`; thiếu secrets thì tự bỏ qua bằng
  ::notice, không fail hằng ngày). actions/checkout@v7, setup-node@v7 (bản mới nhất, kiểm tra qua GitHub API).
  YAML hợp lệ theo schema github-workflow (schemastore) bằng ajv. CHƯA chạy thật trên GitHub.

- [x] `README.md` (tiếng Việt: tính năng, kiến trúc + bảng free tier lấy từ docs Cloudflare 11/2026, yêu cầu, bắt đầu
  nhanh, cấu trúc thư mục, viết bài, CMS, deploy 6 bước, bài hẹn giờ, Giscus, tuỳ biến, phím tắt, test/CI, FAQ,
  giấy phép) + `LICENSE` (MIT, "Nhịp Số contributors"). Link nội bộ + anchor đã kiểm bằng script; còn thiếu (đúng dự
  kiến): docs/screenshot.png, docs/WRITING.md, docs/CLOUDFLARE.md (agent khác/integrator).

## Next
6. Kiểm tra: astro build, astro check, vitest, xem /admin trong trình duyệt (390 & 1440)

## Notes
- Worktree: D:/project-AI/blog-wt/docs. node_modules là junction — không npm install.
- Preview port 4415, playwright-cli session `docs`.
- CMS: `preview_path` dùng `{{dirname}}` thay vì `{{slug}}` (với `path: '{{slug}}/index'`, "slug đầy đủ" của entry có thể
  là `x/index`; `{{dirname}}` là tên thư mục = id Astro).
- CMS: `pubDate`/`updatedDate` dùng `input_timezone: Asia/Ho_Chi_Minh` để lưu kèm `+07:00`. Mặc định Sveltia lưu giờ
  không múi giờ → `z.coerce.date()` trên máy build (UTC) hiểu sai 7 tiếng.
- Validator tạm ở scratchpad/validate-cms.mjs (dùng `yaml` + `ajv` có sẵn trong node_modules, không thêm dep).
- Không chạy `python -` trong bash (treo chờ stdin).
