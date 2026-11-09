# Hướng dẫn viết bài — Nhịp Số

Tài liệu cho người viết: tạo bài, frontmatter, ảnh, khối code, các thành phần MDX, series, bản nháp, hẹn giờ, CMS.
Mọi ví dụ đều sao chép — dán là chạy.

**Mục lục:** [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Cấu trúc thư mục](#cấu-trúc-thư-mục) · [Frontmatter](#frontmatter) ·
[Viết nội dung](#viết-nội-dung) · [Ảnh](#ảnh) · [Khối code](#khối-code-expressive-code) ·
[Thành phần MDX](#thành-phần-mdx) · [Series](#series) · [Nháp & hẹn giờ](#bản-nháp-và-bài-hẹn-giờ) ·
[Nổi bật](#bài-nổi-bật-featured) · [Tóm tắt & ý chính](#tóm-tắt-và-ý-chính) · [Ảnh chia sẻ](#ảnh-chia-sẻ-og-tự-sinh) ·
[Tác giả](#tác-giả) · [CMS hay VS Code?](#cms-admin-hay-vs-code) · [Trước khi đăng](#kiểm-tra-trước-khi-đăng)

---

## Bắt đầu nhanh

```bash
npm run new -- "Tiêu đề bài viết" --category ai --mdx
```

Lệnh trên tạo `src/content/posts/tieu-de-bai-viet/index.mdx` với frontmatter mẫu, `draft: true` và ngày hôm nay
(giờ Việt Nam). Script **không bao giờ ghi đè** bài đã có.

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--category`, `-c` | `ai` · `cong-nghe` · `doi-song` (bỏ trống thì script hỏi) |
| `--tags`, `-t` | Thẻ, cách nhau bằng dấu phẩy: `--tags "Prompt, ChatGPT"` |
| `--mdx` | Tạo `index.mdx` để dùng [thành phần MDX](#thành-phần-mdx). Bỏ đi thì tạo `index.md` |
| `--dry-run` | Chỉ in nội dung ra màn hình, không ghi file |

Sau đó: `npm run dev` → mở `http://localhost:4321/bai-viet/tieu-de-bai-viet/` → viết → đổi `draft: false` → commit → push.

> **`.md` hay `.mdx`?** Bài chỉ có chữ, ảnh, bảng, code → dùng `.md` (sửa được cả trong [CMS](#cms-admin-hay-vs-code)).
> Cần Callout, sơ đồ, video… → dùng `.mdx`.

---

## Cấu trúc thư mục

Mỗi bài là **một thư mục**; tên thư mục chính là đường dẫn bài (`/bai-viet/<tên-thư-mục>/`). Ảnh của bài đặt ngay
trong thư mục đó.

```text
src/content/
├── posts/
│   ├── rag-la-gi/
│   │   ├── index.mdx            ← nội dung bài
│   │   ├── cover.webp           ← ảnh bìa (tuỳ chọn)
│   │   └── rag-pipeline.svg     ← ảnh minh hoạ trong bài
│   └── deep-work-giua-thoi-dai-thong-bao/
│       └── index.md
└── authors/
    └── nhip-so.json             ← thông tin tác giả
```

- Tên thư mục: chữ thường không dấu, số, dấu gạch ngang — ví dụ `git-12-lenh-moi-ngay`.
- **Đừng đổi tên thư mục sau khi đã đăng**: link cũ, lượt xem, reactions và bình luận đều gắn với đường dẫn.
- File `.md`/`.mdx` có tên bắt đầu bằng `_` (ví dụ `posts/_y-tuong.md`) bị bỏ qua — chỗ để ghi chú, bản thảo thô.
  (Chỉ tính tên **file**: `posts/_y-tuong/index.md` vẫn được coi là một bài.)
- Bài một file (`src/content/posts/ten-bai.md`) cũng chạy, nhưng không có chỗ để ảnh đi kèm — nên dùng thư mục.

---

## Frontmatter

Phần đầu bài nằm giữa hai dòng `---`. Schema đầy đủ ở `src/content.config.ts`; sai kiểu dữ liệu thì `npm run dev`/`build`
báo lỗi kèm tên trường.

| Trường | Bắt buộc | Kiểu | Ghi chú |
|---|---|---|---|
| `title` | ✔ | chuỗi | Nên ≤ 70 ký tự để hiện trọn trên Google và ảnh chia sẻ. |
| `description` | ✔ | chuỗi ≤ 300 | Nên 120–160 ký tự. Hiện trên Google, Facebook, Zalo, thẻ bài viết. |
| `pubDate` | ✔ | ngày | `2026-11-09` hoặc có giờ: `2026-12-01T06:00:00+07:00`. Ngày trong tương lai = [hẹn giờ](#bản-nháp-và-bài-hẹn-giờ). |
| `category` | ✔ | `ai` \| `cong-nghe` \| `doi-song` | Danh sách chuyên mục khai báo trong `src/config.ts`. |
| `tags` | | danh sách | `['RAG', 'LLM']`. Thẻ chỉ khác hoa/thường hoặc dấu được gộp làm một (`AI` = `ai`). |
| `updatedDate` | | ngày | Chỉ điền khi sửa nội dung đáng kể sau khi đăng; hiện "· cập nhật 3 ngày trước" cạnh ngày đăng. |
| `cover` | | đường dẫn ảnh | `./cover.webp` — tương đối với file bài. Bỏ trống = ảnh bìa tự sinh theo chuyên mục. |
| `coverAlt` | | chuỗi | Mô tả ảnh bìa. **Nên có** khi dùng `cover`. |
| `author` | | id tác giả | Tên file trong `src/content/authors/` (không có đuôi). Mặc định: `SITE.defaultAuthor`. |
| `draft` | | `true`/`false` | Mặc định `false`. `true` = chỉ hiện khi chạy `npm run dev`. |
| `featured` | | `true`/`false` | Ghim lên khối nổi bật ở trang chủ. |
| `summary` | | chuỗi | 1–3 câu TL;DR, hiện trong hộp "Tóm tắt nhanh" đầu bài. |
| `takeaways` | | danh sách | 3–5 ý chính, hiện dạng danh sách có dấu ✓ dưới `summary`. |
| `series` | | chuỗi | Tên series — các bài cùng tên được nhóm lại. |
| `seriesOrder` | | số nguyên ≥ 1 | Thứ tự trong series. |
| `comments` | | `true`/`false` | Mặc định `true`. `false` tắt bình luận riêng bài này. |
| `slug` | | chuỗi | Ghi đè đường dẫn (ít dùng — mặc định lấy tên thư mục). |

Ví dụ đầy đủ:

```yaml
---
title: 'RAG là gì? Cách cho AI trả lời dựa trên tài liệu của riêng bạn'
description: 'RAG giúp AI trả lời dựa trên tài liệu của bạn thay vì trí nhớ. Tìm hiểu từng bước: chia đoạn, embedding, tìm kiếm vector, ghép prompt.'
pubDate: 2026-10-20
updatedDate: 2026-11-02
category: ai
tags: ['RAG', 'LLM', 'TypeScript']
cover: ./cover.webp
coverAlt: 'Sơ đồ các mảnh tài liệu được nối vào một khung chat.'
series: 'AI cho người mới'
seriesOrder: 3
featured: true
summary: 'RAG là kỹ thuật "tìm trước, viết sau": hệ thống tìm đoạn tài liệu liên quan rồi đưa cho mô hình đọc trước khi trả lời.'
takeaways:
  - 'RAG = tìm đúng đoạn tài liệu, đưa vào prompt, rồi mới để mô hình viết.'
  - 'Chất lượng RAG phụ thuộc nhiều nhất vào bước tìm kiếm.'
draft: false
---
```

> Chuỗi có dấu `:` hoặc `#` phải đặt trong nháy đơn `'…'`. Trong chuỗi nháy đơn, viết dấu nháy đơn bằng hai dấu: `'It''s'`.

---

## Viết nội dung

- **Tiêu đề mục:** dùng `##` (mục chính) và `###` (mục con). Không dùng `#` — tiêu đề bài đã là `h1`.
  Mục lục bên cạnh bài và liên kết neo (`#mo-hinh-ngon-ngu`) được tạo tự động từ `##`/`###`.
- **Liên kết trong site:** dùng đường dẫn tuyệt đối có dấu `/` cuối: `[bài về LLM](/bai-viet/llm-hoat-dong-the-nao/)`.
  Liên kết ra ngoài tự mở tab mới (`rel="noopener noreferrer"`).
- **Chú thích cuối trang:** `Câu cần dẫn nguồn.[^1]` và ở cuối bài `[^1]: Nguồn, năm.` — hiện trong mục "Chú thích".
- **Bảng, trích dẫn (`>`), danh sách, `~~gạch~~`, `**đậm**`, `*nghiêng*`** đều dùng cú pháp Markdown thường (GFM).
- Đoạn văn ngắn (2–4 câu), mỗi mục một ý. Thời gian đọc tính tự động (~260 từ/phút, cộng thêm cho khối code).

---

## Ảnh

### Ảnh bìa

Đặt file vào thư mục bài, khai báo trong frontmatter:

```yaml
cover: ./cover.webp
coverAlt: 'Chiếc chìa khoá có phần đầu là những vân tay đồng tâm trên nền xanh lam đậm.'
```

- Tỉ lệ **16:9**, rộng tối thiểu **1600px**. Định dạng `.webp`/`.jpg`/`.png`/`.avif` — Astro tự nén và tạo nhiều kích thước.
- Không có `cover`? Site tự vẽ ảnh bìa trừu tượng theo màu chuyên mục (cố định cho mỗi bài, không đổi giữa các lần build).

### Ảnh trong bài `.md`

```md
![Biểu đồ số người dùng tăng gấp đôi từ 2024 đến 2026](./bieu-do-nguoi-dung.png)
```

Ảnh tương đối (`./…`) được tối ưu tự động. Ảnh dùng chung cho nhiều bài đặt ở `public/images/` và gọi bằng
`/images/ten-anh.png` (không được tối ưu — nên nén trước).

### Ảnh trong bài `.mdx`

Dùng [`<Figure>`](#figure--ảnh-có-chú-thích) để có chú thích, nguồn ảnh, và tuỳ chọn tràn rộng.

### Viết `alt` thế nào

- Mô tả **nội dung và ý nghĩa** của ảnh với người không nhìn thấy: "Biểu đồ cột: lượt đọc tháng 10 gấp đôi tháng 9",
  không phải "biểu đồ" hay "ảnh 1".
- Không bắt đầu bằng "Hình ảnh của…". Ngắn gọn, thường dưới 125 ký tự; chi tiết dài đưa vào chú thích hoặc đoạn văn.
- Ảnh chỉ để trang trí: `alt=""` (trình đọc màn hình sẽ bỏ qua).
- Ảnh chụp màn hình chứa chữ quan trọng: chép lại phần chữ đó trong `alt` hoặc trong bài.

---

## Khối code (Expressive Code)

Khối code có tô màu, khung, nút sao chép, tự đổi theo giao diện sáng/tối.

````md
```ts title="src/lib/rag.ts" {2-4}
export async function answer(question: string) {
  const chunks = await search(question); // dòng 2–4 được tô nổi bật
  const context = chunks.map((c) => c.text).join('\n');
  return llm(`Dựa vào:\n${context}\n\nTrả lời: ${question}`);
}
```
````

| Cú pháp sau tên ngôn ngữ | Tác dụng |
|---|---|
| `title="ten-file.ts"` | Khung có tab tên file. Khối `bash`/`sh` tự hiện dạng cửa sổ terminal. |
| `{2-4}` hoặc `{1, 5-7}` | Tô nổi bật các dòng. |
| `ins={3}` · `del={2}` | Đánh dấu dòng thêm (xanh) / dòng xoá (đỏ). |
| `"từ khoá"` | Tô nổi bật mọi chỗ xuất hiện đoạn chữ đó. |
| `frame="none"` | Bỏ khung (ví dụ khối lệnh ngắn). |
| `wrap` | Tự xuống dòng thay vì cuộn ngang. |

Thêm/xoá dòng:

````md
```js title="astro.config.mjs" del={2} ins={3}
export default defineConfig({
  site: 'https://example.com',
  site: 'https://nhipso.pages.dev',
});
```
````

Định dạng diff (vẫn tô màu theo ngôn ngữ gốc nhờ `lang`):

````md
```diff lang="ts"
 const posts = await getPosts();
-const latest = posts[0];
+const latest = posts.find((p) => !p.data.draft);
```
````

Lệnh terminal:

````md
```bash
npm run new -- "Tiêu đề" --category ai --mdx
```
````

Code trong dòng: `` `npm run dev` ``.

---

## Thành phần MDX

Chỉ dùng được trong file **`.mdx`**, **không cần `import`** (đã đăng ký sẵn ở `src/components/mdx/index.ts`).

### Callout — hộp chú thích

```mdx
<Callout type="tip" title="Mẹo nhỏ">
Nội dung **Markdown** bình thường, có thể nhiều đoạn, có `code` và [liên kết](/bai-viet/rag-la-gi/).
</Callout>
```

- `type`: `note` (mặc định, "Ghi chú") · `tip` ("Mẹo") · `info` ("Thông tin") · `warning` ("Lưu ý") · `danger` ("Cẩn thận").
- `title`: bỏ trống = tiêu đề mặc định theo loại; `title=""` = ẩn tiêu đề.

### KeyPoint — ý quan trọng cần nhớ

```mdx
<KeyPoint>
LLM không "tra cứu" sự thật; nó dự đoán chữ tiếp theo có xác suất cao nhất.
</KeyPoint>

<KeyPoint title="Nhớ nhé">Mỗi ghi chú chỉ chứa một ý.</KeyPoint>
```

Dùng tiết kiệm — một, hai lần mỗi bài.

### Steps — các bước có đánh số

```mdx
<Steps>

1. **Cài đặt.** Chạy `npm install`.
2. **Chạy thử.** Gõ `npm run dev` rồi mở `http://localhost:4321`.
3. **Xuất bản.** Commit và push lên GitHub.

</Steps>
```

**Bắt buộc** có dòng trống sau `<Steps>` và trước `</Steps>`. Mỗi bước có thể có nhiều đoạn, code, ảnh — thụt lề 3 dấu cách.

### ProsCons — ưu / nhược điểm

```mdx
<ProsCons
  pros={['Miễn phí với blog cá nhân', 'Rất nhanh']}
  cons={['Cần học Git cơ bản']}
/>
```

Đổi tiêu đề cột: `prosTitle="Nên dùng khi"` `consTitle="Tránh khi"`. Cần định dạng phong phú hơn (đậm, liên kết):

```mdx
<ProsCons>
  <Fragment slot="pros">
  - **Nhanh**: phục vụ từ máy chủ gần người đọc.
  </Fragment>
  <Fragment slot="cons">
  - Mỗi thay đổi phải build lại.
  </Fragment>
</ProsCons>
```

Trên điện thoại hai cột tự xếp chồng.

### Figure — ảnh có chú thích

```mdx
import ragPipeline from './rag-pipeline.svg';

<Figure
  src={ragPipeline}
  alt="Sơ đồ RAG: câu hỏi được tìm trong kho tài liệu, các đoạn liên quan được ghép vào prompt rồi gửi cho mô hình."
  caption="Quy trình RAG gồm hai pha: tìm kiếm và sinh câu trả lời."
  credit="Nhịp Số"
  wide
/>
```

- Đặt dòng `import` ngay dưới frontmatter. Ảnh import được tối ưu; SVG giữ nguyên dạng vector.
- `src` cũng nhận chuỗi: `src="/images/a.png"` — khi đó nên thêm `width={1200} height={675}` để trang không bị nhảy.
- `wide`: tràn rộng hơn cột chữ trên màn hình lớn · `eager`: tải ngay (chỉ cho ảnh ở đầu bài).

### YouTube — video nhẹ, không cookie

```mdx
<YouTube id="dQw4w9WgXcQ" title="Tên video mô tả nội dung" />
<YouTube id="dQw4w9WgXcQ" title="Tên video" start={90} caption="Xem từ phút 1:30." />
```

- `id`: đúng 11 ký tự sau `watch?v=` trong link YouTube. Sai định dạng → build báo lỗi.
- `title` bắt buộc (cho trình đọc màn hình). Trình phát chỉ tải khi người đọc bấm (qua youtube-nocookie.com).

### Kbd — phím tắt

```mdx
Nhấn <Kbd>Esc</Kbd> để đóng, <Kbd keys="Ctrl+Shift+P" /> để mở bảng lệnh,
<Kbd keys="mod+K" /> để tìm kiếm.
```

`mod` hiện thành "Ctrl/⌘". Viết tắt được hiểu: `cmd`, `alt`, `option`, `shift`, `enter`, `esc`, `tab`, `space`, `up`/`down`/`left`/`right`.

### Diagram — sơ đồ SVG tự đổi màu sáng/tối

```mdx
<Diagram
  label="Sơ đồ: một mũi tên đi từ hộp Câu hỏi sang hộp Mô hình."
  caption="Tìm trước, viết sau."
  maxWidth={520}
>
  <svg viewBox="0 0 460 120">
    <rect class="dg-box" x="10" y="32" width="130" height="56" rx="12" />
    <text class="dg-text" x="75" y="66" text-anchor="middle">Câu hỏi</text>
    <path class="dg-line" d="M140 60 H310" />
    <path class="dg-fill-line" d="M310 52 L322 60 L310 68 Z" />
    <rect class="dg-accent" x="322" y="32" width="128" height="56" rx="12" />
    <text class="dg-text dg-strong dg-text-accent" x="386" y="66" text-anchor="middle">Mô hình</text>
  </svg>
</Diagram>
```

- `label` **bắt buộc**: mô tả đầy đủ nội dung sơ đồ cho người dùng trình đọc màn hình.
- Lớp màu (đổi theo sáng/tối, đừng dùng mã màu cứng):
  - Hình: `dg-box` · `dg-soft` · `dg-accent` · `dg-hot` · `dg-ok`
  - Đường: `dg-line` · `dg-line-accent` · `dg-line-dash` (kết hợp được: `class="dg-line-accent dg-line-dash"`)
  - Chữ: `dg-text` · `dg-muted` · `dg-small` · `dg-lg` · `dg-strong` · `dg-mono` · `dg-text-accent` · `dg-text-on` (chữ trên nền đậm)
  - Tô đặc (đầu mũi tên…): `dg-fill-accent` · `dg-fill-hot` · `dg-fill-ok` · `dg-fill-line`
- `viewBox` rộng khoảng 420–520 để chữ còn đọc được trên điện thoại. Sơ đồ nhỏ: thêm `maxWidth` để không bị phóng quá to.
  Sơ đồ nhiều chi tiết: `minWidth={560}` cho phép cuộn ngang trên màn hình hẹp. `wide` để tràn rộng trên desktop.
- **Không để dòng trống bên trong `<svg>`** — MDX sẽ hiểu sai.

### Lưu ý khi viết MDX

- Ghi chú ẩn: `{/* ghi chú */}` — **không** dùng `<!-- -->` (lỗi trong MDX).
- Ký tự `{`, `}`, `<` trong đoạn văn thường phải đặt trong code (`` `a < b` ``) hoặc viết `\{`, `&lt;`.
- Thuộc tính là chuỗi dùng `"…"`; số, mảng, biến dùng `{…}`: `start={90}`, `pros={['A', 'B']}`, `src={anh}`.
- Lỗi MDX hiện ngay trong terminal khi chạy `npm run dev`, kèm số dòng.

---

## Series

Đặt **cùng một tên** `series` cho các bài, đánh số bằng `seriesOrder`:

```yaml
series: 'AI cho người mới'
seriesOrder: 2
```

Site tự tạo trang `/series/ai-cho-nguoi-moi/`, hiện "Phần 2/3" ở đầu bài và danh sách các phần để chuyển nhanh.
Tên series phải gõ giống hệt nhau ở mọi bài (kể cả dấu). Thiếu `seriesOrder` thì xếp theo ngày đăng.

---

## Bản nháp và bài hẹn giờ

| Trạng thái | Cách đặt | `npm run dev` | Bản build (site thật) |
|---|---|---|---|
| Nháp | `draft: true` | Hiện | Ẩn hoàn toàn (không trang, không RSS, không sitemap, không tìm kiếm) |
| Hẹn giờ | `pubDate` trong tương lai | Hiện | Ẩn cho tới lần build **sau** thời điểm `pubDate` |
| Đã đăng | `draft: false`, `pubDate` ≤ hôm nay | Hiện | Hiện |

Vì site là trang tĩnh, bài hẹn giờ chỉ lên trang khi **có một lần build mới** sau thời điểm `pubDate`. Workflow tuỳ chọn
[`.github/workflows/scheduled-deploy.yml`](../.github/workflows/scheduled-deploy.yml) build lại mỗi ngày lúc
**06:00 giờ Việt Nam** — cách bật: README, mục *Bài hẹn giờ*.

> **Ghi giờ rõ ràng cho bài hẹn giờ.** `pubDate: 2026-12-01` (chỉ có ngày) được hiểu là 00:00 UTC = **07:00 giờ Việt
> Nam**, tức là *sau* lần build 06:00 sáng hôm đó → bài lên trang sáng hôm sau. Muốn lên đúng sáng ngày 1/12 với lịch
> build mặc định, ghi: `pubDate: 2026-12-01T00:00:00+07:00` (mọi giờ ≤ 06:00 đều được).

---

## Bài nổi bật (`featured`)

`featured: true` đưa bài lên khối nổi bật đầu trang chủ: bài `featured` mới nhất thành thẻ lớn, các bài `featured` tiếp
theo đứng cạnh (bù bằng bài mới nhất nếu chưa đủ). Nên giữ khoảng 2–4 bài `featured` cùng lúc, gỡ bớt khi có bài mới đáng ghim.

---

## Tóm tắt và ý chính

```yaml
summary: 'Một đến ba câu trả lời ngay câu hỏi chính của bài.'
takeaways:
  - 'Ý chính thứ nhất — một câu, có động từ.'
  - 'Ý chính thứ hai.'
  - 'Ý chính thứ ba.'
```

Cả hai hiện trong hộp **"Tóm tắt nhanh"** ở đầu bài, giúp người đọc lướt quyết định có đọc tiếp không.
`description` dành cho Google/mạng xã hội; `summary` dành cho người đã mở bài — đừng chép y nguyên.

---

## Ảnh chia sẻ (OG) tự sinh

Khi build, mỗi bài có một ảnh 1200×630 tại `/og/<tên-bài>.png` (dùng khi chia sẻ lên Facebook, Zalo, X…): tiêu đề,
chuyên mục, thời gian đọc, ngày đăng, và ảnh bìa của bài (hoặc ảnh bìa tự sinh). Trang không phải bài viết dùng
`/og/index.png`. Không cần làm gì thêm.

- Tiêu đề tự thu nhỏ để vừa tối đa 3 dòng; dài quá (~90 ký tự trở lên) sẽ bị cắt bằng "…" → thêm lý do giữ tiêu đề ≤ 70 ký tự.
- Ảnh bìa nên có vùng bên phải "đẹp" — nửa trái bị phủ tối để chữ dễ đọc.
- Mã nguồn: `src/lib/og.ts` (bố cục, màu) và `src/pages/og/`.

---

## Tác giả

Thông tin tác giả ở `src/content/authors/<id>.json`, hiện ở đầu bài, hộp "Viết bởi" cuối bài và trang Giới thiệu.
Tác giả mặc định là `nhip-so` (đổi trong `SITE.defaultAuthor`, `src/config.ts`).

```json
{
  "name": "Nguyễn Văn A",
  "role": "Người viết & biên tập",
  "bio": "Một, hai câu giới thiệu dành cho người đọc.",
  "avatar": "./nguyen-van-a.jpg",
  "links": {
    "website": "https://example.com/",
    "github": "https://github.com/ten-tai-khoan"
  }
}
```

- `avatar` (tuỳ chọn): ảnh vuông ≥ 256px đặt cạnh file JSON. Không có thì hiện chữ cái đầu của tên.
- `links` nhận `website`, `github`, `facebook`, `x`, `linkedin` — phải là URL đầy đủ; không dùng thì xoá dòng đó.
- Bài của tác giả khác: thêm file `src/content/authors/nguyen-van-a.json`, rồi trong bài ghi `author: nguyen-van-a`.

---

## CMS `/admin` hay VS Code?

| Việc | Nên dùng |
|---|---|
| Viết bài chữ + ảnh (`.md`), sửa lỗi chính tả, đổi `draft`, trên điện thoại | **CMS** (Sveltia) tại `/admin/` |
| Bài có thành phần MDX (`.mdx`: Callout, Diagram, Steps…), khối code phức tạp | **VS Code** (hoặc trình soạn bất kỳ) |

- CMS chỉ hiện và chỉ tạo bài **`.md`**; bài `.mdx` không xuất hiện trong danh sách — đó là chủ ý, để CMS không làm
  hỏng cú pháp component.
- Ảnh tải lên qua CMS được lưu ngay trong thư mục bài (được tối ưu như ảnh thường).
- Mỗi lần lưu trong CMS là một commit lên GitHub → Cloudflare tự build lại sau 1–2 phút.
- Cài đặt CMS (repo, đăng nhập bằng token/OAuth): README, mục *CMS trên web*. Thêm trường mới vào
  `src/content.config.ts` thì sửa `public/admin/config.yml` cho khớp.

---

## Kiểm tra trước khi đăng

- [ ] `title` ≤ 70 ký tự, `description` 120–160 ký tự, có `summary`/`takeaways` nếu bài dài.
- [ ] Đọc lại trên điện thoại ở cả giao diện sáng và tối: `npm run dev -- --host` rồi mở địa chỉ "Network" mà terminal
      in ra bằng điện thoại cùng Wi-Fi (hoặc thu hẹp cửa sổ trình duyệt).
- [ ] Mọi ảnh có `alt` có nghĩa (hoặc `alt=""` nếu chỉ trang trí); có `coverAlt` khi có `cover`.
- [ ] Liên kết nội bộ có dấu `/` cuối, liên kết ngoài còn sống.
- [ ] Dùng lại thẻ sẵn có (xem `/the/`) thay vì tạo thẻ gần giống.
- [ ] `npm run check` và `npm run build` không lỗi.
- [ ] Đổi `draft: false` (hoặc đặt `pubDate` hẹn giờ) → commit → push.
