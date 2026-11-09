# Blog "Nhịp Số" — kế hoạch triển khai

Mục tiêu: blog tĩnh (AI · Công nghệ · Đời sống) tiếng Việt, cực nhanh, UX tốt từ mobile tới desktop,
viết bài bằng Markdown/MDX trên GitHub, deploy miễn phí trên Cloudflare.

## Kiến trúc (quyết định)
- Astro 7 (static output) + Tailwind v4 + MDX + Expressive Code
- Cloudflare Workers Static Assets (hoặc Pages) — free, CDN toàn cầu, auto-deploy khi push GitHub
- Worker nhỏ `/api/*` + D1 cho lượt xem, reactions, đăng ký newsletter (tuỳ chọn, site vẫn chạy nếu chưa bật)
- Pagefind (tìm kiếm tĩnh), Giscus (bình luận qua GitHub Discussions), Sveltia CMS (/admin, sửa bài trên web)
- OG image tự sinh lúc build (satori), cover SVG tự sinh khi bài không có ảnh

## Checklist
- [x] 1. Research + smoke test stack (Astro 7, Cloudflare, CMS, Pagefind, fonts)
- [x] 2. Foundation: config, design tokens, layout, header/footer, content schema, utils, PostCard, home, post page
- [x] 3. git init + commit foundation
- [ ] 4. Features (fan-out bị dừng do hết quota; main loop đã tự làm phần đầu, phần còn lại giao subagent theo worktree, commit liên tục):
  - [x] Search palette (⌘K) + trang tìm kiếm + phím tắt
  - [x] Trải nghiệm đọc: TOC, progress, action bar mobile, lightbox, anchors, back-to-top
  - [ ] Reader settings + nghe bài (TTS) + chia sẻ trích dẫn khi bôi đen
  - [~] Thư viện cá nhân: core xong (lưu bài, lịch sử, đọc tiếp); còn trang /thu-vien/, PWA/offline
  - [ ] Worker API + D1: views, reactions, newsletter
  - [ ] Nội dung mẫu + MDX components + cover/OG generator
  - [~] Trang phụ: category/tag/archive/series/about/404/RSS/robots xong; còn CMS, script tạo bài, README, CI
- [ ] 5. Merge + build + test (unit, e2e, visual mobile/desktop, light/dark)
- [ ] 6. Review workflow (UX/a11y, perf/SEO, bugs) → fix
- [ ] 7. Báo cáo + hướng dẫn deploy

## Review
(điền khi xong)
