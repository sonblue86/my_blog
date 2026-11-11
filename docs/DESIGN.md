# Gì thế nhỉ — Design system & quy ước code

Tài liệu này là "hợp đồng" chung cho mọi phần của giao diện. Đọc trước khi thêm component.

## Tinh thần thiết kế
- **Editorial, bình tĩnh, tập trung vào chữ.** Nền giấy ấm (light) / mực sâu (dark), một màu nhấn indigo-violet,
  điểm xuyết màu san hô (coral) cho chi tiết "nóng" (progress bar, badge mới).
- **Nhanh là một tính năng.** Mặc định 0 framework JS. Tương tác viết bằng TypeScript thuần trong `<script>` của
  component Astro (được bundle + dedupe). Không React/Vue trừ khi thật cần.
- **Mobile trước.** Mọi thao tác chính trong tầm ngón cái (action bar dưới cùng trên trang bài viết).
  Vùng chạm tối thiểu 44×44px. Không hover-only.
- **Tôn trọng người đọc.** `prefers-reduced-motion`, focus ring rõ ràng, tương phản AA, không pop-up chặn đọc,
  không tracking bên thứ ba.

## Thương hiệu
- **Tên:** Gì thế nhỉ (tên không có dấu "?"; wordmark ở header thêm một dấu "?" màu `--hot` chỉ để trang trí,
  `aria-hidden`). Domain: <https://githenhi.com>. Khẩu hiệu: *Hỏi cho ra lẽ về AI, công nghệ và đời sống.*
- **Giọng văn:** tò mò, thân thiện, thông minh, đáng tin. Mỗi bài bắt đầu từ một câu hỏi người đọc thật sự thắc mắc
  và trả lời rõ ràng — dữ kiện đã kiểm chứng, ví dụ dùng được ngay. Tránh giật tít và chơi chữ quá đà.
- **Viết tên giữa câu:** "blog Gì thế nhỉ" hoặc đặt trong ngoặc kép (“Gì thế nhỉ”) — đứng trơ trọi giữa câu, tên dễ bị
  đọc thành một câu hỏi.
- **Logo:** ô vuông bo góc gradient indigo → coral (`#6d5dfc → #f0562e`), bong bóng thoại trắng chứa dấu hỏi indigo
  đậm (`#4a3bd6`) với chấm coral. Hình học nằm duy nhất ở `src/lib/brand-mark.mjs` (dùng chung cho `Logo.astro`, ảnh OG
  và favicon/icon PWA); sửa xong chạy `npm run icons`.

## Màu (CSS variables trong `src/styles/global.css`)
| Token | Ý nghĩa |
|---|---|
| `--bg`, `--bg-elevated`, `--bg-subtle`, `--bg-muted` | nền: trang / thẻ nổi / vùng phụ / hover |
| `--fg`, `--fg-muted`, `--fg-subtle` | chữ: chính / phụ / mờ (vẫn ≥ 4.5:1) |
| `--border`, `--border-strong` | viền |
| `--accent`, `--accent-fg`, `--accent-soft` | màu nhấn / chữ trên nền nhấn / nền nhấn nhạt |
| `--hot` | coral — dùng rất ít |
| `--cat-ai`, `--cat-tech`, `--cat-life` | màu chuyên mục (chip, chấm, cover) |

Tailwind v4 map các token này thành utility: `bg-bg`, `bg-elevated`, `bg-subtle`, `bg-muted`, `text-fg`,
`text-fg-muted`, `text-fg-subtle`, `border-border`, `border-border-strong`, `text-accent`, `bg-accent`,
`bg-accent-soft`, `text-hot`... **Không hard-code mã màu trong component** — luôn dùng token để dark mode tự đúng.

Dark mode: `data-theme="dark"` trên `<html>`; variant Tailwind `dark:` đã được cấu hình theo attribute này.

## Chữ
- UI + tiêu đề: **Be Vietnam Pro** (thiết kế cho tiếng Việt). Thân bài mặc định: sans; người đọc có thể đổi sang
  serif **Literata** trong "Tuỳ chỉnh đọc". Code: **JetBrains Mono**.
- Biến: `--font-sans`, `--font-serif`, `--font-mono`, `--font-reading` (font thân bài, đổi theo setting).
- Thang chữ tiêu đề dùng `clamp()` (fluid). Thân bài: `--reader-size` (mặc định 18px desktop / 17px mobile),
  `--reader-leading` 1.75, `--reader-width` 68ch.

## Khoảng cách, bo góc, bóng
- Container: `.container-page` (max 1200px, gutter 16px mobile / 24px tablet / 32px desktop).
- Bo góc: `--radius-sm` 8px, `--radius` 12px, `--radius-lg` 18px, `--radius-xl` 28px.
- Bóng: `--shadow-sm`, `--shadow`, `--shadow-lg` (nhẹ, nhiều lớp).
- Chuyển động: `--ease-out` cubic-bezier(.2,.8,.2,1), thời lượng 150–250ms. Bọc animation lớn trong
  `@media (prefers-reduced-motion: no-preference)`.

## Quy ước script phía client
- Mỗi tính năng là một module trong `src/scripts/<feature>.ts`, được import từ `<script>` của component.
- Script phải **idempotent** và khởi tạo lại an toàn (xem mục View Transitions bên dưới).
- `localStorage` luôn bọc try/catch qua helper `src/lib/storage.ts`.
- Giao tiếp giữa tính năng qua CustomEvent trên `document` với tiền tố `ns:` (ví dụ `ns:toast`,
  `ns:bookmarks-changed`, `ns:open-search`, `ns:open-settings`).
- Toast: `document.dispatchEvent(new CustomEvent('ns:toast', { detail: { message, icon? } }))`.

## Điều hướng & URL
| Trang | URL |
|---|---|
| Bài viết | `/bai-viet/<slug>/` |
| Chuyên mục | `/chuyen-muc/<id>/`, phân trang `/chuyen-muc/<id>/2/` |
| Thẻ | `/the/`, `/the/<tag>/` |
| Series | `/series/<slug>/` |
| Lưu trữ | `/luu-tru/` |
| Tìm kiếm | `/tim-kiem/?q=` |
| Thư viện cá nhân (đã lưu, đang đọc) | `/thu-vien/` |
| Giới thiệu | `/gioi-thieu/` |

Luôn có dấu `/` cuối (trailingSlash: 'always').

## Hợp đồng giữa các tính năng (events & data attributes)
Mọi tính năng giao tiếp qua `CustomEvent` trên `document` hoặc data-attribute — không import chéo component của nhau.

| Tín hiệu | Ai phát | Ai nghe / xử lý |
|---|---|---|
| `ns:toast` `{ message, tone?: 'ok'\|'info'\|'error', action?: {label, href}, duration? }` | bất kỳ | `ui/Toaster.astro` |
| `ns:open-search` (hoặc click `[data-open-search]`) | Header, trang chủ, phím tắt | `search/SearchPalette.astro` |
| `ns:theme-changed` `{ theme, pref }` | `scripts/theme.ts` | Giscus, bất kỳ |
| click `[data-open-settings]` / `ns:open-settings` | ActionBar, meta bài viết, phím `S` | `post/ReaderSettings.astro` |
| click `[data-listen-toggle]` / `ns:toggle-listen` | ActionBar, meta bài viết, phím `L` | `post/ListenPlayer.astro` (tự cập nhật `aria-pressed` cho mọi `[data-listen-toggle]`) |
| `ns:listen-state` `{ playing, paused }` | ListenPlayer | ActionBar (nếu cần) |
| click `[data-open-toc]` / `ns:open-toc` | ActionBar (mobile) | `post/Toc.astro` (bottom sheet) |
| click `[data-bookmark]` (xem `library/BookmarkButton.astro`) | mọi nơi | `library/LibraryCore.astro` (delegation; đặt `aria-pressed`) |
| `ns:bookmarks-changed` `{ ids }` | LibraryCore | bất kỳ |
| `ns:toggle-bookmark-current` | phím `B` | LibraryCore (bookmark bài đang đọc) |

Trang bài viết có sẵn: `html[data-page-type="article"]`, `article.post[data-post-id][data-post-url][data-post-title][data-minutes]`,
nội dung bài ở `#post-body.prose`.

### localStorage (qua `src/lib/storage.ts`, tiền tố `ns:`)
| Key | Dạng | Chủ sở hữu |
|---|---|---|
| `theme` | `'light' \| 'dark' \| 'system'` | theme.ts |
| `reader` | `{ font?: 'sans'\|'serif'\|'display', scale?: number, leading?: number, width?: number /*ch*/ }` — được áp dụng TRƯỚC khi vẽ bởi script inline trong `Head.astro` | ReaderSettings |
| `bookmarks` | `Array<{ id, title, url, description, category, minutes, cover, date, savedAt }>` | LibraryCore |
| `history` | `Array<{ id, title, url, cover, category, minutes, progress /*0..1*/, scrollY, lastReadAt }>` | LibraryCore |
| `recent-searches` | `string[]` | SearchPalette |
| `reactions` | `Record<postId, string[]>` | Reactions |

### Phân lớp z-index
header 40 · action bar/back-to-top 45 · reading progress 50 · popover (selection share) 60 · dialog/sheet (native `<dialog>` top-layer) · toaster 100.

### Breakpoints (Tailwind mặc định)
sm 640 · md 768 · lg 1024 (TOC hiện) · xl 1280 (rail trái hiện). Dưới md: action bar dưới đáy thay cho nút trong meta.
