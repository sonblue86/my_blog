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

## Next
3. `tests/unit/posts.test.ts`, `tests/unit/date.test.ts`
4. `README.md` + `LICENSE`
5. `.github/workflows/ci.yml` + `scheduled-deploy.yml`
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
