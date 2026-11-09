# Progress — content agent (branch feat/content)

## Done
- (bắt đầu) Đọc DESIGN.md, config, content schema, PostLayout, prose.css, lib/*.
- MDX components xong + đã xem trên trình duyệt (390 light, 1440 dark): Callout, Figure, YouTube, Steps, ProsCons,
  KeyPoint, Kbd, Diagram (thêm: khung SVG inline dùng class dg-* theo token). Đăng ký ở src/components/mdx/index.ts.
  xin-chao/index.mdx đang chứa phần "Thử thành phần MDX" (sẽ xoá cả bài khi có bài thật).
- Bài 1/9 llm-hoat-dong-the-nao (mdx, Diagram inline, featured) · 2/9 viet-prompt-hieu-qua (mdx, updatedDate)
  · 3/9 rag-la-gi (mdx, Figure + rag-pipeline.svg co-located, code TS, featured). Build OK.
- 4/9 dung-blog-astro-github-cloudflare (mdx, featured) · 5/9 passkey-dang-nhap-khong-can-mat-khau (mdx, cover.webp)
  · 6/9 git-12-lenh-moi-ngay (mdx, Diagram inline) · 7/9 digital-detox-30-ngay (.md, cover.webp, updatedDate)
  · 8/9 deep-work-giua-thoi-dai-thong-bao (.md).
- Cover sinh bằng sharp: <scratchpad>/make-covers.mjs (passkey, digital-detox, zettelkasten — cover.webp đã có sẵn cả 3).
- 9/9 ghi-chep-thong-minh-zettelkasten (commit a4ec538). Đã merge vào main tích hợp.
- (phiên 2) Xoá src/content/posts/xin-chao/; authors/nhip-so.json: bio chỉ cho người đọc (bỏ câu "sửa trong file"),
  links chỉ còn website = domain site (bỏ link github.com trống). Hướng dẫn sửa sẽ nằm trong docs/WRITING.md.
- OG images xong: src/lib/og.ts (satori → sharp, font BVP 500/700/800 tách 3 subset), src/pages/og/[...slug].png.ts,
  src/pages/og/index.png.ts, tests/unit/og.test.ts (17 test). Build sinh 10 PNG 230–390KB, ~0.3–0.5s/ảnh.
  Đã mở xem: index, passkey/digital-detox/zettelkasten (cover riêng), deep-work (dài nhất), llm, git, rag — dấu tiếng Việt đủ.

- docs/WRITING.md xong. Mọi ví dụ MDX/Expressive Code đã dán vào một bài nháp tạm, chạy dev 4421 → render đúng
  (ProsCons slot, Steps, escape, footnote) → đã xoá bài tạm.
  Phát hiện: pubDate chỉ có ngày = 00:00 UTC = 07:00 VN → sau lần build hằng ngày 06:00 → bài hẹn giờ lên trễ 1 ngày.
  Đã ghi rõ trong WRITING.md (khuyên ghi T00:00:00+07:00). README/new-post template không thuộc quyền sửa → báo orchestrator.

- Verify cuối (main tích hợp): `npm run build` OK (10 OG PNG, Pagefind 9 trang) · `npx astro check` 0 lỗi/0 cảnh báo
  (103 file) · `npx vitest run` 13 file / 200 test pass · og:image của mọi bài trỏ tới file có thật trong dist.
  Trình duyệt (dev 4421): passkey (cover riêng) 390 sáng + 1440 tối, digital-detox (cover riêng, .md) 390 tối + 1440 sáng,
  llm 390 tối — không tràn ngang, ảnh đều có alt, theme đúng. Đã đóng trình duyệt, tắt dev server.

## Next
- (hết việc trong phạm vi content) — xem "Báo orchestrator" bên dưới.

## Báo orchestrator (file không thuộc quyền content)
- scripts/test-api.mjs: TEST_SLUG mặc định 'xin-chao' → bài đã xoá; đổi thành 'llm-hoat-dong-the-nao'.
- public/admin/config.yml dòng ~80: comment ví dụ "xin-chao" (chỉ là chú thích, vô hại).
- pubDate chỉ có ngày = 07:00 giờ VN; cron hằng ngày 06:00 → bài hẹn giờ lên trễ 1 ngày. README ("Bài hẹn giờ") và
  template new-post (ví dụ T08:00+07:00) nên ghi rõ, hoặc đổi cron sang '5 0 * * *' (07:05 VN).

## Notes
- Đếm chữ: node <scratchpad>/check-posts.mjs (dùng countWords của src/lib/text.ts; mục tiêu 900–1600, desc 120–160).
- Diagram inline: thiết kế viewBox ~420–520 rộng, chữ ≥18px để còn đọc được ở 390px (chữ 16px/520 quá nhỏ trên mobile).
- Icon inline trong flex/grid: cần `flex:none` cho svg, nếu không svg bị kéo giãn chiều cao.
- Worktree D:/project-AI/blog-wt/content, port 4421, playwright session `content`.
- node_modules là junction — không npm install.
- OG/satori: phần tử absolute vẽ đè lên phần tử thường bất kể thứ tự → khối chữ cũng phải absolute.
  textWrap:'balance' + lineClamp làm tiêu đề bị bóp hẹp → không dùng. Ảnh cover riêng lấy qua `cover.fsPath`.
  Thử nhanh không cần build: node <scratchpad>/og-try.mts (cwd = worktree).
