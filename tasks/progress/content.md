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

## Next
4. docs/WRITING.md
5. Verify: build, astro check, vitest, browser 390/1440 light/dark

## Notes
- Đếm chữ: node <scratchpad>/check-posts.mjs (dùng countWords của src/lib/text.ts; mục tiêu 900–1600, desc 120–160).
- Diagram inline: thiết kế viewBox ~420–520 rộng, chữ ≥18px để còn đọc được ở 390px (chữ 16px/520 quá nhỏ trên mobile).
- Icon inline trong flex/grid: cần `flex:none` cho svg, nếu không svg bị kéo giãn chiều cao.
- Worktree D:/project-AI/blog-wt/content, port 4421, playwright session `content`.
- node_modules là junction — không npm install.
- OG/satori: phần tử absolute vẽ đè lên phần tử thường bất kể thứ tự → khối chữ cũng phải absolute.
  textWrap:'balance' + lineClamp làm tiêu đề bị bóp hẹp → không dùng. Ảnh cover riêng lấy qua `cover.fsPath`.
  Thử nhanh không cần build: node <scratchpad>/og-try.mts (cwd = worktree).
