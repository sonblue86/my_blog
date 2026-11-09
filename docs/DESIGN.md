# Nhịp Số — Design system & quy ước code

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
