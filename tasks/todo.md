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
- [x] 4. Features (2 lần bị ngắt do quota; lần 2 dùng worktree + commit liên tục nên không mất việc)
  - [x] Search palette (⌘K) + trang tìm kiếm + phím tắt
  - [x] Trải nghiệm đọc: TOC, progress, action bar mobile, lightbox, anchors, back-to-top
  - [x] Reader settings + nghe bài (TTS) + chia sẻ trích dẫn khi bôi đen
  - [x] Thư viện cá nhân + /thu-vien/ + PWA/offline (service worker)
  - [x] Worker API + D1: views, reactions, newsletter
  - [x] Nội dung mẫu (9 bài) + MDX components + cover/OG generator
  - [x] Trang phụ, CMS (Sveltia), npm run new, README, CI
- [x] 5. Merge + build + test — build OK, astro check 0 lỗi, 213/213 unit test, xem thử mobile/desktop sáng/tối
- [ ] 6. Review (UX/a11y trên trình duyệt, săn lỗi code, perf/SEO) → sửa — đang chạy
- [ ] 7. Báo cáo + hướng dẫn deploy

## Review
(điền khi xong)
