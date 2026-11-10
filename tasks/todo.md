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
**Kết quả:** blog hoàn chỉnh — 9 bài mẫu, ~25 trang, 222 unit test, `astro check` 0 lỗi, Worker typecheck OK, build ~10 s.

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

## Review sau deploy (2026-11-10)
Đã kiểm: lịch sử git (105 commit, không lộ secret), Worker API trên site thật, header, sink HTML, SW, build + 222 test.
- [x] /admin: ghim Sveltia CMS 0.262.1 + SRI; CSP /admin/* chỉ cho script từ unpkg.com (chưa thử sau khi đăng nhập bằng token)
- [x] Worker từ chối ghi (503) khi thiếu HASH_SALT; /api/health báo "salt"
- [ ] Chủ blog: xác nhận HASH_SALT đã đặt trên production TRƯỚC khi deploy (thiếu thì lượt xem/cảm xúc ngừng đếm)
- [x] Newsletter: bỏ lời hứa chưa làm được (tần suất, huỷ đăng ký)
- [ ] Chủ blog: tạo khoá Turnstile (siteKey vào src/config.ts, secret bằng wrangler) — chưa bật
- [x] CSP (meta do Astro sinh + integrations/csp-inline.mjs cho script is:inline) + HSTS; đã thử trên wrangler dev: bài viết, Giscus, tìm kiếm Pagefind, /ngau-nhien/, /admin/ — không vi phạm
- [ ] Gỡ link nhipso.pages.dev (không tồn tại) và link GitHub/Facebook chung chung ở footer
- [ ] Domain riêng (workers.dev đang lộ tên tài khoản email); đổi email commit sang noreply của GitHub
- [ ] giscus.json giới hạn origin; bật branch protection + secret scanning trên GitHub (chưa kiểm được, máy không có gh)
- [ ] Header vỡ dòng ở bề rộng ~800px

## Trang viết bài /viet-bai/ (2026-11-10, nhánh feat/viet-bai)
- [x] Lõi: GitHub client (1 lần lưu = 1 commit), đọc/ghi frontmatter, nén ảnh trong trình duyệt
- [x] Trình soạn trực quan (Milkdown Crepe), bảng thiết lập, xem trước máy tính/điện thoại, lưu nháp/đăng/gỡ/xoá, tự giữ bản dở
- [x] /api/ai (DeepSeek): chỉ phục vụ token GitHub ghi được repo; dàn ý, viết nháp, sửa đoạn, gợi ý tiêu đề/mô tả/thẻ
- [x] CSP (connect-src api.github.com), robots, sitemap, service worker, tài liệu

**Đã kiểm chứng:** 253 unit test; astro check; build; trên wrangler dev với GitHub giả lập cho thao tác GHI (đọc thì gọi
GitHub thật): đăng nhập, danh sách 9 bài, mở/sửa bài .md, ảnh bìa tải từ GitHub, tạo bài mới + ảnh bìa (2,3 MB → 203 KB),
đăng bài = 1 commit đúng nội dung; file sinh ra build được bằng Astro thật; sáng/tối, 375px; không vi phạm CSP.

**Chưa kiểm chứng:** ghi lên GitHub thật bằng token thật; trợ lý AI với khoá DeepSeek thật (mới test đơn vị phần
dựng prompt, xác thực, chuyển SSE); kéo-thả/dán ảnh vào thân bài (dùng chung đường xử lý với ảnh bìa); Safari/Firefox.

**Việc của chủ blog:** merge nhánh; (tuỳ chọn) `npx wrangler secret put DEEPSEEK_API_KEY`.
