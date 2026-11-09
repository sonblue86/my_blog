# Progress — feat/library (thư viện cá nhân + PWA/offline)

## Done
- (bắt đầu) Đọc DESIGN.md, library-store.ts, LibraryCore.astro, BaseLayout, Head, Toaster, global.css.
- Store helpers trong `src/scripts/library-store.ts` (toEntries, sortEntries, remainingMinutes, restoreBookmark/restoreHistory/removeHistoryWhere/restoreMany, exportLibrary/parseLibraryFile/merge*/importLibrary, safePath) + 19 unit tests xanh (`tests/unit/library-store.test.ts`).

- Trang `/thu-vien/` v1: `src/pages/thu-vien/index.astro` + `src/scripts/library-page.ts` + `src/scripts/library-offline.ts` + `src/components/library/{LIcon,LibraryEmpty}.astro`. Build xanh. CHƯA xem trên trình duyệt.

## Next
2. (đang làm) Unit test DOM cho buildCard/buildUndoRow; xem /thu-vien/ trên browser; rồi tiếp mục 3. Trang `/thu-vien/` (tabs, card list, undo, sort, xoá tất cả + dialog, empty states, privacy, badge offline, xuất/nhập)
3. `scripts/gen-icons.mjs` + chạy, commit icons
4. `public/manifest.webmanifest`
5. `public/sw.js`
6. `/offline/`
7. Verify: build, astro check, vitest, browser (390x844, 1440x900, light/dark, offline)

## Notes
- Toaster chỉ hỗ trợ action dạng link (href) → undo làm inline ngay trên thẻ đã xoá (không sửa Toaster).
- LibraryCore gửi `{type:'cache-post'|'uncache-post', url, cover}` tới `navigator.serviceWorker.controller`.
