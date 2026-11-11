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
- Gỡ worktree có junction `node_modules`: xoá junction bằng PowerShell `(Get-Item … -Force).Delete()` và KIỂM TRA nó đã mất,
  rồi mới `git worktree remove`. Lý do: `cmd //c rmdir` từ Git Bash thất bại âm thầm, `git worktree remove --force` xoá
  xuyên qua junction → hỏng node_modules của repo chính (phải `npm ci` lại).
- `<dialog>` modal đặt trong phần tử `display:none` vẫn "mở" và làm cả trang trơ (inert) nhưng vô hình → đơ trang.
  Đặt dialog/sheet ngoài các cột bị ẩn theo breakpoint. Lý do: lỗi chỉ hiện ở mobile, desktop vẫn chạy đúng.
- Không đặt biến CSS thay đổi liên tục (tiến độ cuộn) trên `<html>`, và tránh `html:has(...)`: cả hai buộc tính lại
  style toàn trang (đo được ~0.5 s/lần trên máy tầm trung). Đặt biến trên đúng phần tử dùng nó; đồng bộ trạng thái bằng data-attribute.
- Style scoped của Astro không nằm trong layer → luôn thắng utility Tailwind v4 (vd. `max-sm:hidden` bị `.x{display:flex}` đè).
  Ẩn/hiện theo breakpoint thì viết trong chính `<style>` của component.
- Animation `box-shadow` lặp vô hạn giữ main thread bận liên tục; chỉ animate `transform`/`opacity`.
- Ảnh OG là gradient đục → JPEG (~50 KB) thay vì PNG RGBA (~300 KB, app nhắn tin bỏ preview khi > ~300 KB).
- Astro `security.csp` KHÔNG băm `<script is:inline>` và `style-src-elem` không kế thừa `style-src` → trang mất JS/CSS âm thầm.
  Giữ `integrations/csp-inline.mjs`; mỗi lần thêm nguồn ngoài (iframe, script, CSS) phải thử bản build trên `wrangler dev`, không phải `astro dev` (dev không áp CSP).
- Build lại khi `wrangler dev` đang chạy có thể để lại 404 bị cache (header Cache-Control áp cả cho 404) → tải lại trang trước khi kết luận lỗi.
- Đo kích thước phần tử (scrollHeight…) khi view còn `display:none` luôn ra 0 → ô tiêu đề tự co về 0px. Đo sau khi hiện view.
- Sửa nhiều file bằng một script thay chuỗi: script dừng ở chuỗi đầu tiên không khớp và bỏ dở phần sau → kiểm lại từng thay đổi, hoặc dùng Edit.
- Nội dung tự dựng chèn vào `.prose` sẽ dính kiểu danh sách của bài (số thứ tự, chấm tròn, khoảng cách li). Khối tự vẽ marker phải tắt các kiểu đó bằng selector đủ mạnh (`ol.nb.nb-steps`), không dựa vào thứ tự file CSS.
- Thư viện chèn `<style>` lúc chạy (CodeMirror/style-mod, nhiều UI kit) sẽ vỡ giao diện âm thầm dưới CSP băm style. Kiểm tra console CSP ngay khi thêm thư viện UI; ưu tiên bỏ/thay thư viện hơn là nới CSP.
- Bộ đệm console của công cụ trình duyệt giữ lỗi qua các lần tải trang: muốn biết lỗi có còn không thì ghi một mốc (console.error) rồi chỉ xét các dòng sau mốc.
- gsk (Genspark CLI): gpt-image-2.5 không xuất nền trong suốt (`--background transparent` bị bỏ qua) → vẽ trên nền xanh #00FF00 rồi tự tách nền;
  `-o` tải bản JPEG có watermark — lấy PNG sạch bằng `gsk download /api/files/s/<id>` (Git Bash: `MSYS_NO_PATHCONV=1`).
- Ảnh trang trí chỉ dành cho màn hình lớn: ẩn bằng CSS vẫn bị tải nếu là ảnh eager → dùng `<picture>` với ảnh trống 1×1 cho màn nhỏ.
- Đổi logo/wordmark dài hơn thì đo lại header ở mọi breakpoint (360, 1024, 1280): menu từng gãy dòng ở 1024px.
