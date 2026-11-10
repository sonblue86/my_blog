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
- [x] 6. Review (3 reviewer độc lập: UX/a11y trên trình duyệt, săn lỗi code, perf/SEO) → đã sửa 2 high + 9 medium + phần lớn low
- [x] 7. Báo cáo + hướng dẫn deploy (README + docs/CLOUDFLARE.md)

## Review
**Kết quả:** blog hoàn chỉnh — 9 bài mẫu, ~25 trang, 222 unit test,  0 lỗi, Worker typecheck OK, build ~10 s.

**Đã kiểm chứng:** build + Pagefind; unit test; Worker API end-to-end (scripts/test-api.mjs 40/40 với wrangler dev + D1 local);
trình duyệt thật ở 375/390 và 1280/1440 px, sáng/tối (mục lục, thanh công cụ, đọc tiếp, tìm kiếm, offline, OG image).

**Review đã sửa:** sheet mục lục vô hình làm đơ trang trên mobile; restyle toàn trang khi cuộn; tìm kiếm không dấu với đ
+ kết quả rác; cuộn xuyên dialog; SW mất CSS khi offline; tìm kiếm offline trắng; reactions đếm phồng theo ngày; chấm live
ngốn CPU; trang thẻ 1 bài lọt sitemap; OG 300 KB → 50 KB; font latin-ext thừa (~113 KB/trang) + Inter nghiêng (61 KB);
tương phản, vùng chạm 44px, theme-color, TTS + bfcache, lộ email đã đăng ký, slug C++/C#, prefetch, RSS.

**Còn lại / chưa kiểm chứng:**
- Chưa deploy thật lên Cloudflare (cần tài khoản của chủ blog) — docs/CLOUDFLARE.md viết theo tài liệu, chưa chạy trên tài khoản thật.
- Giọng đọc tiếng Việt thật (Edge/Android/iOS) chưa thử trên thiết bị thật; Safari/Firefox chưa thử.
- Header tự ẩn có thể chen vào khi kéo bôi đen sát mép trên (nhỏ).
- Be Vietnam Pro 600 chỉ dùng cho nút/chip — gộp vào 700 sẽ bớt ~34 KB (quyết định thiết kế).

