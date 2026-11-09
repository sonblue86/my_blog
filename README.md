# Nhịp Số

**Blog tiếng Việt về AI, công nghệ & đời sống — viết chậm, đọc sâu.**
Site tĩnh siêu nhanh dựng bằng [Astro](https://astro.build), chạy miễn phí trên Cloudflare, trải nghiệm đọc được chăm chút
từ điện thoại tới màn hình lớn.

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
![Node 24](https://img.shields.io/badge/node-24-339933)
![Chi phí 0đ](https://img.shields.io/badge/chi%20ph%C3%AD-0%C4%91-success)
![MIT](https://img.shields.io/badge/license-MIT-blue)

![Ảnh chụp màn hình blog Nhịp Số: trang bài viết trên điện thoại và máy tính, chế độ sáng và tối](docs/screenshot.png)

> **Mục lục:** [Tính năng](#tính-năng-nổi-bật) · [Kiến trúc](#kiến-trúc--lý-do-chọn) · [Bắt đầu nhanh](#bắt-đầu-nhanh) ·
> [Cấu trúc thư mục](#cấu-trúc-thư-mục) · [Viết bài](#viết-bài) · [CMS /admin](#cms-trên-web-admin) ·
> [Deploy](#deploy-lên-cloudflare) · [Bài hẹn giờ](#bài-hẹn-giờ) · [Bình luận](#bình-luận-giscus) · [Tuỳ biến](#tuỳ-biến) ·
> [Phím tắt](#phím-tắt) · [Kiểm thử & CI](#kiểm-thử--ci) · [FAQ](#câu-hỏi-thường-gặp) · [Giấy phép](#giấy-phép)

---

## Tính năng nổi bật

### Cho người đọc

| Tính năng | Ghi chú |
|---|---|
| **Tìm kiếm tức thì** — <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd> hoặc <kbd>/</kbd> | Gõ không dấu vẫn ra (`tri tue` → "trí tuệ"); tìm toàn văn bằng Pagefind, có trang `/tim-kiem/` |
| **Mục lục + thanh tiến độ** | Mục lục dính bên phải trên desktop, dạng bảng trượt trên điện thoại; hiện số phút còn lại |
| **Thanh công cụ trong tầm ngón cái** | Trên điện thoại: mục lục, lưu bài, nghe, tuỳ chỉnh, chia sẻ ở đáy màn hình |
| **Tuỳ chỉnh đọc** | Cỡ chữ, giãn dòng, độ rộng cột, font sans/serif — nhớ cho lần sau, áp dụng trước khi trang hiện ra (không nháy) |
| **Nghe bài viết tiếng Việt** | Đọc to bằng giọng tiếng Việt có sẵn trên máy (Web Speech API), không cần server |
| **Bôi đen để chia sẻ trích dẫn** | Chọn một đoạn → sao chép kèm link hoặc chia sẻ ngay |
| **Lưu đọc sau, đọc tiếp, đọc offline** | Thư viện cá nhân `/thu-vien/`, "Đọc tiếp nhé" ở trang chủ; bài đã lưu đọc được cả khi mất mạng (PWA) |
| **Chế độ tối có hiệu ứng** | Chuyển sáng/tối bằng hiệu ứng lan toả mượt (tắt khi bạn bật "giảm chuyển động") |
| **Chế độ tập trung** | Ẩn mọi thứ trừ nội dung bài |
| **Phím tắt** | <kbd>J</kbd>/<kbd>K</kbd> nhảy mục, <kbd>B</kbd> lưu bài, <kbd>L</kbd> nghe… — xem [bảng phím tắt](#phím-tắt) |
| **Lượt xem & reactions** | Đếm bằng Worker + D1, không cookie, không theo dõi bên thứ ba |
| **Bình luận Giscus** | Lưu trên GitHub Discussions, tự đổi theme sáng/tối |
| **RSS** | `/rss.xml` cho trình đọc tin |
| **OG image & ảnh bìa tự sinh** | Ảnh chia sẻ Facebook/Zalo tạo lúc build; bài không có ảnh bìa vẫn có bìa đẹp theo chuyên mục |

### Cho người viết

- **Markdown hoặc MDX** — mỗi bài một thư mục, ảnh đặt ngay cạnh bài và được Astro tự tối ưu (WebP/AVIF, nhiều kích thước).
- **CMS trên web tại `/admin/`** ([Sveltia CMS](https://sveltiacms.app)) — viết, sửa, tải ảnh ngay trên trình duyệt, kể cả trên điện thoại.
- **`npm run new`** — tạo khung bài mới với frontmatter đầy đủ trong 1 giây.
- **Bài nháp & hẹn giờ** — `draft: true` chỉ hiện khi chạy dev; `pubDate` trong tương lai sẽ tự lên trang đúng ngày.
- **Series** — gom các bài nhiều phần, tự có điều hướng "phần trước / phần sau" và trang `/series/<tên>/`.
- Mục lục, thời gian đọc, bài liên quan, chuyên mục, thẻ, lưu trữ, sitemap — **tất cả tự động**.

---

## Kiến trúc & lý do chọn

```text
 Người viết ── git push / CMS /admin ──►  GitHub  ──► GitHub Actions: CI (kiểm tra, test, build thử)
                                            │
                                            ▼
                         Cloudflare Workers Builds: npm run build  (Astro → HTML tĩnh + Pagefind)
                                            │
                                            ▼
 Người đọc ◄── CDN toàn cầu ── Cloudflare Worker "nhip-so"
                                 ├─ Static Assets: HTML, CSS, ảnh, chỉ mục tìm kiếm  (miễn phí, không giới hạn request)
                                 └─ /api/*  → Worker nhỏ ──► D1 (SQLite): lượt xem, reactions, đăng ký nhận bài
```

| Thành phần | Vì sao |
|---|---|
| **Astro 7, output tĩnh** | HTML dựng sẵn → tải cực nhanh, SEO tốt, gần như 0 JavaScript. Tương tác viết bằng TypeScript thuần, không framework UI. |
| **Cloudflare Workers Static Assets** | Request tới file tĩnh **miễn phí và không giới hạn**, CDN toàn cầu, có điểm phát gần Việt Nam. |
| **Worker nhỏ + D1** | Chỉ chạy cho `/api/*` (lượt xem, reactions, newsletter). API chưa bật thì site vẫn chạy bình thường. |
| **Không dùng Cloudflare Pages?** | Pages vẫn hoạt động, nhưng Cloudflare khuyến nghị **bắt đầu dự án mới bằng Workers** — Workers là nền tảng chính, nhận tính năng mới trước (Workers Builds, Deploy Hooks, rate limit, cron…). |
| **Pagefind** | Tìm kiếm toàn văn chạy hoàn toàn trên trình duyệt, không cần server tìm kiếm. |
| **Giscus + Sveltia CMS** | Bình luận và CMS đều dựa trên GitHub — không database riêng, không phí. |

### Chi phí: 0đ

Với một blog cá nhân, mọi thứ nằm gọn trong gói miễn phí (số liệu theo tài liệu Cloudflare, tháng 11/2026):

| Dịch vụ | Gói miễn phí | Blog này dùng cho |
|---|---|---|
| Static Assets | Request **không giới hạn**; tối đa 20.000 file/phiên bản, 25 MiB/file | Mọi trang, ảnh, tìm kiếm |
| Workers | 100.000 request/ngày, 10 ms CPU/request | Chỉ `/api/*` |
| D1 | 5 triệu dòng đọc/ngày, 100.000 dòng ghi/ngày, 5 GB (500 MB/database) | Lượt xem, reactions, newsletter |
| Workers Builds | 3.000 phút build/tháng, 1 build cùng lúc | Build mỗi lần push |
| GitHub Actions | Không giới hạn với repo public; 2.000 phút/tháng với repo private | CI, deploy hằng ngày |

Bạn chỉ tốn tiền nếu muốn mua tên miền riêng (tuỳ chọn).

---

## Yêu cầu

- **Node.js 24** (theo [`.nvmrc`](.nvmrc); tối thiểu 22.23 theo `engines`). Dùng [nvm](https://github.com/nvm-sh/nvm) /
  [fnm](https://github.com/Schniz/fnm): `nvm use`.
- **npm ≥ 10.8** (khuyến nghị; đi kèm Node 24).
- Git, và một tài khoản GitHub + Cloudflare (miễn phí) khi deploy.

## Bắt đầu nhanh

```bash
git clone https://github.com/OWNER/REPO.git nhip-so
cd nhip-so
nvm use            # chuyển sang Node 24
npm install
npm run dev        # mở http://localhost:4321
```

| Lệnh | Làm gì |
|---|---|
| `npm run dev` | Chạy site ở `http://localhost:4321`, tự tải lại khi sửa. Bài nháp cũng hiện. |
| `npm run dev:all` | Như trên + chạy Worker API ở `:8787` (lượt xem, reactions, newsletter); `/api` được proxy tự động. Lần đầu chạy `npm run db:migrate:local` để tạo D1 cục bộ. |
| `npm run build` | Build production vào `dist/` + tạo chỉ mục tìm kiếm Pagefind. |
| `npm run preview` | Build rồi chạy y như production (Worker + file tĩnh) ở `http://localhost:8787`. |
| `npm run new -- "Tiêu đề"` | Tạo bài mới — xem [Viết bài](#viết-bài). |
| `npm test` · `npm run check` | Unit test · kiểm tra kiểu TypeScript/Astro. |

> Tìm kiếm toàn văn (Pagefind) chỉ có sau khi build. Khi `npm run dev`, bảng tìm kiếm vẫn tìm theo tiêu đề, mô tả và thẻ.

---

## Cấu trúc thư mục

```text
.
├── src/
│   ├── config.ts              ← tên blog, URL, mạng xã hội, chuyên mục, Giscus, bật/tắt tính năng
│   ├── content.config.ts      ← schema frontmatter (zod) của bài viết & tác giả
│   ├── content/
│   │   ├── posts/<slug>/      ← MỖI BÀI MỘT THƯ MỤC: index.md(x) + ảnh của bài
│   │   └── authors/           ← thông tin tác giả (*.json)
│   ├── pages/                 ← các route: /bai-viet/, /chuyen-muc/, /the/, /series/, /tim-kiem/, /thu-vien/, rss.xml…
│   ├── layouts/               ← BaseLayout, PostLayout
│   ├── components/            ← layout/ post/ library/ search/ listing/ ui/ widgets/ mdx/
│   ├── scripts/               ← TypeScript phía trình duyệt (theme, search, library, share…)
│   ├── lib/                   ← hàm dùng lúc build: posts, date, text (slug, thời gian đọc)…
│   └── styles/                ← global.css (design tokens, màu), prose.css (thân bài)
├── worker/                    ← Cloudflare Worker cho /api/*
├── migrations/                ← schema D1 (SQL)
├── public/
│   ├── admin/                 ← Sveltia CMS: index.html + config.yml
│   └── _headers, _redirects   ← header bảo mật/cache, chuyển hướng
├── scripts/                   ← công cụ dòng lệnh (new-post.mjs…)
├── tests/unit/                ← unit test (vitest)
├── docs/                      ← DESIGN.md, WRITING.md, CLOUDFLARE.md
├── .github/workflows/         ← ci.yml, scheduled-deploy.yml
└── astro.config.mjs · wrangler.jsonc · package.json
```

---

## Viết bài

Hướng dẫn đầy đủ (frontmatter, ảnh, MDX component, series, mẹo SEO): **[docs/WRITING.md](docs/WRITING.md)**. Tóm tắt:

```bash
npm run new -- "Prompt hiệu quả cho người mới" --category ai --tags "Prompt, ChatGPT"
# → src/content/posts/prompt-hieu-qua-cho-nguoi-moi/index.md  (bản nháp)
```

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--category`, `-c` | `ai` · `cong-nghe` · `doi-song` (bỏ trống thì script hỏi) |
| `--tags`, `-t` | Thẻ, cách nhau bằng dấu phẩy |
| `--mdx` | Tạo `index.mdx` để dùng component |
| `--dry-run` | Chỉ in ra màn hình, không ghi file |

Script tự tạo đường dẫn không dấu (`đ` → `d`), điền ngày hôm nay theo giờ Việt Nam, đặt `draft: true`, và **không bao
giờ ghi đè** bài đã có. Khi viết xong: đổi `draft: false` → commit → push.

Frontmatter tối thiểu:

```yaml
---
title: 'Prompt hiệu quả cho người mới'
description: 'Mô tả 120–160 ký tự, hiện trên Google và khi chia sẻ.'
pubDate: 2026-11-09            # hoặc 2026-12-01T00:00:00+07:00 để hẹn giờ
category: ai
tags: ['Prompt', 'ChatGPT']
cover: ./cover.jpg             # tuỳ chọn — bỏ trống sẽ có ảnh bìa tự sinh
draft: false
---
```

---

## CMS trên web (`/admin/`)

[Sveltia CMS](https://sveltiacms.app) cho phép viết bài ngay trên trình duyệt; mỗi lần lưu là một commit vào GitHub,
Cloudflare tự build lại. Cấu hình ở [`public/admin/config.yml`](public/admin/config.yml).

1. Sửa `repo: OWNER/REPO` trong `public/admin/config.yml` thành repo của bạn, commit & push.
2. Chọn cách đăng nhập:
   - **Cách nhanh — token:** GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens →
     Generate new token*. *Repository access:* **Only select repositories** → chọn repo blog. *Permissions:*
     **Contents: Read and write** (Metadata: Read được thêm tự động). Đặt hạn dùng (ví dụ 90 ngày).
     Mở `https://<domain>/admin/` → **Sign In with Token** → dán token.
   - **Cách thân thiện cho nhiều người — OAuth:** deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)
     lên Cloudflare Workers (miễn phí), tạo GitHub OAuth App, rồi bỏ comment dòng `base_url:` trong `config.yml`.
3. Viết bài: **Bài viết → Mới**. Ảnh tải lên được lưu ngay trong thư mục bài.

Lưu ý:
- Khi chạy `npm run dev`, mở **`http://localhost:4321/admin/index.html`** (dev server không tự mở `index.html` của `/admin/`).
  Trên Chrome/Edge có thể chọn **Work with Local Repository** để sửa thẳng file trên máy, không cần token.
- CMS quản lý bài `.md`. Bài `.mdx` (có component tương tác) sửa trực tiếp trong mã nguồn.
- Token được lưu trong trình duyệt: chỉ đăng nhập trên máy của bạn, thu hồi token ngay nếu mất máy.
- Thêm/đổi trường trong `src/content.config.ts` thì sửa `config.yml` cho khớp.

---

## Deploy lên Cloudflare

Hướng dẫn chi tiết từng bước, kèm xử lý lỗi thường gặp: **[docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)**. Tóm tắt 6 bước:

1. **Đưa mã lên GitHub** (repo public hoặc private đều được).
2. **Đăng nhập Cloudflare từ máy:** `npx wrangler login`.
3. **Tạo database D1:** `npx wrangler d1 create blog-db --location apac --binding DB --update-config`
   (lệnh tự điền `database_id` vào `wrangler.jsonc`) → commit.
4. **Tạo bảng:** `npm run db:migrate:remote`.
5. **Kết nối repo:** Dashboard Cloudflare → *Workers & Pages → Create → Import a repository* → chọn repo.
   Build command `npm run build`, deploy command `npx wrangler deploy`. Sau lần deploy đầu, đặt secret:
   `npx wrangler secret put HASH_SALT` (một chuỗi ngẫu nhiên bất kỳ). Từ giờ mỗi lần push lên `main` là site tự cập nhật.
6. **Tên miền & URL:** gắn domain riêng (tuỳ chọn), rồi đổi `SITE.url` trong `src/config.ts` và `site_url` trong
   `public/admin/config.yml` cho khớp.

> Chưa muốn dùng API (lượt xem, reactions, newsletter)? Đặt `SITE.features` về `false` trong `src/config.ts` — site vẫn
> chạy hoàn toàn tĩnh.

### Bài hẹn giờ

Site tĩnh chỉ build khi có commit mới, nên bài có `pubDate` trong tương lai sẽ chờ tới lần build kế tiếp.
Workflow [`.github/workflows/scheduled-deploy.yml`](.github/workflows/scheduled-deploy.yml) build lại **mỗi ngày lúc
07:05 giờ Việt Nam** (và chạy tay được ở tab *Actions*). Thêm **một** trong hai bộ secret
(*Settings → Secrets and variables → Actions*):

| Cách | Secret | Khi nào dùng |
|---|---|---|
| A — Deploy Hook | `CLOUDFLARE_DEPLOY_HOOK_URL` (Worker → *Settings → Builds → Deploy Hooks*, nhánh `main`) | Đang deploy bằng Workers Builds — đơn giản nhất |
| B — Wrangler | `CLOUDFLARE_API_TOKEN` (mẫu *Edit Cloudflare Workers*) + `CLOUDFLARE_ACCOUNT_ID` | Muốn deploy thẳng từ GitHub Actions |

Không đặt secret nào thì workflow tự bỏ qua, không báo lỗi. Cần đăng đúng giờ hơn? Sửa dòng `cron` (giờ UTC).

---

## Bình luận (Giscus)

1. Bật **Discussions** cho repo (*Settings → General → Features*). Repo cần public.
2. Cài app [giscus](https://github.com/apps/giscus) cho repo.
3. Vào [giscus.app/vi](https://giscus.app/vi), nhập repo, chọn mapping **pathname** và một category (khuyên dùng *Announcements*).
4. Chép `repo`, `repoId`, `category`, `categoryId` vào `GISCUS` trong `src/config.ts`.

Để trống `GISCUS.repo` để tắt bình luận toàn site, hoặc đặt `comments: false` cho riêng một bài.

---

## Tuỳ biến

| Muốn đổi | Sửa ở |
|---|---|
| Tên blog, khẩu hiệu, mô tả, URL, số bài mỗi trang | `SITE` trong [`src/config.ts`](src/config.ts) |
| Mạng xã hội, chuyên mục, menu, Giscus, bật/tắt lượt xem · reactions · newsletter | cũng trong `src/config.ts` |
| Màu sắc (sáng & tối), bo góc, bóng, font | design tokens trong [`src/styles/global.css`](src/styles/global.css) |
| Kiểu chữ thân bài | [`src/styles/prose.css`](src/styles/prose.css) |
| Thông tin tác giả | `src/content/authors/*.json` (hoặc qua CMS) |
| Quy ước thiết kế, sự kiện giữa các tính năng, localStorage | [`docs/DESIGN.md`](docs/DESIGN.md) — đọc trước khi thêm component |

> Thêm chuyên mục mới cần sửa 3 nơi cho khớp: `CATEGORIES` trong `src/config.ts`, `z.enum` trong `src/content.config.ts`,
> và `options` của trường `category` trong `public/admin/config.yml` (cùng `CATEGORIES` trong `scripts/lib/new-post-core.mjs`).

---

## Phím tắt

Nhấn <kbd>?</kbd> ở bất kỳ trang nào để xem bảng này. Phím tắt tạm tắt khi bạn đang gõ vào ô nhập liệu.

| Phím | Ở mọi trang | | Phím | Trong bài viết |
|---|---|---|---|---|
| <kbd>/</kbd> | Tìm kiếm | | <kbd>J</kbd> | Mục tiếp theo |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>K</kbd> | Mở bảng lệnh | | <kbd>K</kbd> | Mục trước |
| <kbd>T</kbd> | Đổi giao diện sáng/tối | | <kbd>B</kbd> | Lưu / bỏ lưu bài |
| <kbd>G</kbd> rồi <kbd>H</kbd> | Về trang chủ | | <kbd>L</kbd> | Nghe bài viết |
| <kbd>R</kbd> | Đọc bài ngẫu nhiên | | <kbd>S</kbd> | Tuỳ chỉnh đọc |
| <kbd>?</kbd> | Xem phím tắt | | <kbd>C</kbd> | Tới bình luận |

---

## Kiểm thử & CI

```bash
npm test           # unit test (vitest): slug tiếng Việt, thời gian đọc, ngày giờ VN, bài liên quan, series, script tạo bài…
npm run check      # astro check: lỗi TypeScript & template
npm run build      # build production đầy đủ
```

- Test nằm ở `tests/unit/*.test.ts`. Test cần DOM thì thêm dòng đầu `// @vitest-environment happy-dom`.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): mỗi lần push lên `main` và mỗi pull request →
  `npm ci` → `npm run check` → `npm test` → `npm run build`. Domain thật khác `SITE.url`? Đặt biến repository `SITE_URL`.
- **Deploy hằng ngày** (tuỳ chọn): xem [Bài hẹn giờ](#bài-hẹn-giờ).

---

## Câu hỏi thường gặp

<details>
<summary><b>Tôi vừa viết bài nhưng không thấy trên site?</b></summary>

Kiểm tra theo thứ tự: `draft: true` (bài nháp chỉ hiện khi `npm run dev`) → `pubDate` có nằm trong tương lai không
(bài hẹn giờ) → build trên Cloudflare có lỗi không (*Workers & Pages → nhip-so → Deployments*).
</details>

<details>
<summary><b>Build báo "data does not match collection schema"?</b></summary>

Frontmatter sai kiểu hoặc thiếu trường bắt buộc (`title`, `description`, `pubDate`, `category`). Thông báo lỗi chỉ rõ
file và trường. `category` chỉ nhận `ai`, `cong-nghe`, `doi-song`; `description` tối đa 300 ký tự.
</details>

<details>
<summary><b>Có tốn tiền không?</b></summary>

Không, với lưu lượng của một blog cá nhân — xem [Chi phí](#chi-phí-0đ). File tĩnh được phục vụ miễn phí không giới hạn;
chỉ request `/api/*` tính vào hạn mức 100.000/ngày của Workers. Hết hạn mức thì API tạm ngừng, bài viết vẫn đọc được.
</details>

<details>
<summary><b>Đổi tên miền thì sửa những gì?</b></summary>

`SITE.url` trong `src/config.ts`, `site_url`/`display_url` trong `public/admin/config.yml`, và (nếu dùng) biến repository
`SITE_URL` trên GitHub. Sitemap, RSS, OG image, link chia sẻ đều lấy theo URL này.
</details>

<details>
<summary><b>Ảnh nên để ở đâu?</b></summary>

Ngay trong thư mục của bài (`src/content/posts/<slug>/`), chèn bằng `![Mô tả ảnh](./ten-anh.jpg)`. Astro tự nén và tạo
nhiều kích thước. Chỉ dùng `public/images/` cho ảnh dùng chung không cần tối ưu.
</details>

<details>
<summary><b>Dùng Cloudflare Pages thay cho Workers được không?</b></summary>

Được (output là site tĩnh thuần), nhưng Cloudflare khuyến nghị Workers cho dự án mới, và Worker `/api/*` + D1 trong repo
này được cấu hình cho Workers (`wrangler.jsonc`). Dùng Pages thì bạn tự chuyển API sang Pages Functions.
</details>

<details>
<summary><b>Tìm kiếm khi chạy dev không ra nội dung trong bài?</b></summary>

Chỉ mục toàn văn Pagefind được tạo lúc build. Chạy `npm run build && npm run preview` để thử đầy đủ.
</details>

<details>
<summary><b>Trang /admin báo lỗi hoặc trắng trơn?</b></summary>

Khi dev hãy mở `/admin/index.html`. Trên site thật: kiểm tra `repo:` trong `config.yml` đúng `tên-tài-khoản/tên-repo`
và token còn hạn, có quyền *Contents: Read and write* cho đúng repo.
</details>

---

## Giấy phép

- **Mã nguồn:** [MIT](LICENSE) — tự do dùng, sửa, chia sẻ.
- **Nội dung** (bài viết, hình ảnh trong `src/content/`): thuộc về tác giả, **không** nằm trong giấy phép MIT.
  Muốn dùng lại nội dung, vui lòng liên hệ tác giả.
