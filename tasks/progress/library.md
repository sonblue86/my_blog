# Progress — feat/library (thư viện cá nhân + PWA/offline)

## Done
- (bắt đầu) Đọc DESIGN.md, library-store.ts, LibraryCore.astro, BaseLayout, Head, Toaster, global.css.
- Store helpers trong `src/scripts/library-store.ts` (toEntries, sortEntries, remainingMinutes, restoreBookmark/restoreHistory/removeHistoryWhere/restoreMany, exportLibrary/parseLibraryFile/merge*/importLibrary, safePath) + 19 unit tests xanh (`tests/unit/library-store.test.ts`).

- Trang `/thu-vien/` v1: `src/pages/thu-vien/index.astro` + `src/scripts/library-page.ts` + `src/scripts/library-offline.ts` + `src/components/library/{LIcon,LibraryEmpty}.astro`. Build xanh. DOM tests `tests/unit/library-page.test.ts` (10 xanh). Đã xem trên browser (390 + 1440, light/dark): fix thumb tràn cột desktop, fix undo row làm tràn ngang (grid minmax(0,1fr)). Remove→undo, clear-all dialog→banner hoàn tác, empty state OK.

- Icons: `scripts/gen-icons.mjs` (sharp, ICO tự viết 16/32/48 PNG) → public/favicon.svg|ico, apple-touch-icon.png (180, opaque), icon-192/512.png, icon-maskable-512.png (opaque, mark 78%). Đã xem preview (mask tròn OK).
- `public/manifest.webmanifest` (commit 225147f).
- `public/sw.js` reviewed + rewritten (v2, commit 47a9383): bỏ placeholder `__BUILD_ID__` (không ai stamp) → VERSION thủ công + shell (/offline/, /) re-precache mỗi lần install và ≤6h khi online; cờ update lưu trong cache (`/__ns-sw-updated`) → postMessage `updated` chỉ khi thay SW cũ; navigation preload; 5xx → bản cache; key trang bỏ query; header HTML cache bỏ content-length/encoding; ảnh: chọn srcset lớn nhất + fallback "ảnh anh em" cùng hash khi offline; cache fonts riêng; GC cho STATIC & SAVED. Unit tests `tests/unit/library-sw.test.ts` (6 xanh, chạy sw.js trong vm).
- LibraryCore: gửi cache-post/uncache-post qua `postToSW` (registration.active — chạy cả khi trang chưa bị SW control); toast "phiên bản mới" chỉ khi trang đã mở >20s.

- `/offline/` (commit bfef420): `src/pages/offline/index.astro` + `src/scripts/library-offline-page.ts` (+7 tests `tests/unit/library-offline-page.test.ts`). Liệt kê bài trong SAVED + PAGES (+ trang chủ precache), meta từ localStorage hoặc HTML cache (chỉ parse thẻ nút bookmark/<title> qua <template> inert). "Thử lại" = reload (khi là fallback) / về referrer hoặc / (khi mở trực tiếp); tự reload khi `online`. Build + astro check 0 lỗi.

## Next
7. Verify: npm run build + astro preview --port 4424; SW install/activate; bookmark → saved cache; offline → bài đã xem/lưu mở được, trang lạ → /offline/; /thu-vien/ badge; manifest/icons; 390x844 + 1440x900 light/dark cho /offline/ & /thu-vien/. astro check + vitest.

## Notes
- Toaster chỉ hỗ trợ action dạng link (href) → undo làm inline ngay trên thẻ đã xoá (không sửa Toaster).
- Tên cache phải khớp giữa `public/sw.js` và `src/scripts/library-offline.ts` (ns-saved-v1, ns-pages-v1).
- Static build: query không đổi HTML → SW lưu trang theo pathname.
