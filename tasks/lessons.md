# Lessons

Bài học có thể tổng quát hoá (kèm lý do). Giữ ngắn gọn, cập nhật khi có bài học mới.

- Kiểm tra version thực tế trên npm trước khi viết config (Astro đã lên v7 — kiến thức cũ về v4/v5 có thể sai API).
  Lý do: tránh viết config theo trí nhớ rồi build lỗi hàng loạt.

- Không chạy `npm ci` song song trong nhiều worktree trên máy này: tiến trình mồ côi làm build 5 giây treo > 5 phút.
  Thay vào đó: junction `node_modules` về repo chính + `cacheDir` cục bộ trong astro.config.mjs.
  Lý do: tiết kiệm I/O, không khoá file, worktree build ngay được.
- Khi giao việc cho subagent: bắt commit sau từng đơn vị việc + file tiến độ `tasks/progress/<area>.md`.
  Lý do: quota có thể hết giữa chừng — lần đầu mất trắng toàn bộ việc của 7 agent.
- Viết file có nhiều dấu nháy bằng công cụ Write, không dùng heredoc bash dài (đã hỏng parse một lần).
- Astro 7: `compressHTML` mặc định 'jsx' nuốt khoảng trắng giữa thẻ inline → đặt `compressHTML: true`.
- Pagefind không gập "đ" → thêm meta `ascii` (đã fold) để gõ không dấu vẫn tìm được.
- Vite 8 / Lightning CSS: viết `-webkit-backdrop-filter` TRƯỚC `backdrop-filter`. Ngược lại, minifier giữ mỗi bản có
  tiền tố và Chrome bỏ qua nó → header/thanh công cụ mất hiệu ứng mờ. Lý do: lỗi chỉ lộ ra ở bản build, không thấy khi dev.
- Kiểm thử offline cho service worker: tắt server thật. `setOffline`/`network-state-set offline` của Playwright không chặn fetch của chính SW.
