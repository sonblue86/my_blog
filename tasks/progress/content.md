# Progress — content agent (branch feat/content)

## Done
- (bắt đầu) Đọc DESIGN.md, config, content schema, PostLayout, prose.css, lib/*.

## Next
1. MDX components: Callout, Figure, YouTube, Steps(+Step), ProsCons, KeyPoint, Kbd → src/components/mdx/index.ts
2. 9 bài viết (commit sau mỗi bài):
   - ai: llm-hoat-dong-the-nao (series 1), viet-prompt-hieu-qua (series 2), rag-la-gi (series 3)
   - cong-nghe: dung-blog-astro-cloudflare, passkey-dang-nhap-khong-mat-khau, git-12-lenh-moi-ngay
   - doi-song: digital-detox-30-ngay, deep-work-thoi-dai-thong-bao, ghi-chep-zettelkasten
   - xoá xin-chao khi có bài thật; cập nhật authors/nhip-so.json
3. OG images: src/lib/og.ts, src/pages/og/[...slug].png.ts, src/pages/og/index.png.ts, tests/unit/og.test.ts
4. docs/WRITING.md
5. Verify: build, astro check, vitest, browser 390/1440 light/dark

## Notes
- Worktree D:/project-AI/blog-wt/content, port 4411, playwright session `content`.
- node_modules là junction — không npm install.
