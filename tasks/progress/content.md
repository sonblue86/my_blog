# Progress — content agent (branch feat/content)

## Done
- (bắt đầu) Đọc DESIGN.md, config, content schema, PostLayout, prose.css, lib/*.
- MDX components xong + đã xem trên trình duyệt (390 light, 1440 dark): Callout, Figure, YouTube, Steps, ProsCons,
  KeyPoint, Kbd, Diagram (thêm: khung SVG inline dùng class dg-* theo token). Đăng ký ở src/components/mdx/index.ts.
  xin-chao/index.mdx đang chứa phần "Thử thành phần MDX" (sẽ xoá cả bài khi có bài thật).

## Next
2. 9 bài viết (commit sau mỗi bài):
   - ai: llm-hoat-dong-the-nao (series 1), viet-prompt-hieu-qua (series 2), rag-la-gi (series 3)
   - cong-nghe: dung-blog-astro-cloudflare, passkey-dang-nhap-khong-mat-khau, git-12-lenh-moi-ngay
   - doi-song: digital-detox-30-ngay, deep-work-thoi-dai-thong-bao, ghi-chep-zettelkasten
   - xoá xin-chao khi có bài thật; cập nhật authors/nhip-so.json
3. OG images: src/lib/og.ts, src/pages/og/[...slug].png.ts, src/pages/og/index.png.ts, tests/unit/og.test.ts
4. docs/WRITING.md
5. Verify: build, astro check, vitest, browser 390/1440 light/dark

## Notes
- Diagram inline: thiết kế viewBox ~420–520 rộng, chữ ≥18px để còn đọc được ở 390px (chữ 16px/520 quá nhỏ trên mobile).
- Icon inline trong flex/grid: cần `flex:none` cho svg, nếu không svg bị kéo giãn chiều cao.
- Worktree D:/project-AI/blog-wt/content, port 4411, playwright session `content`.
- node_modules là junction — không npm install.
