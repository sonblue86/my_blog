# Đưa Gì thế nhỉ lên Cloudflare — từng bước cho người mới

Hướng dẫn này đưa blog từ máy bạn lên Internet, **miễn phí**, với Cloudflare. Làm lần đầu mất khoảng 30–45 phút;
sau đó mỗi lần `git push` là site tự cập nhật.

**Bạn sẽ có gì khi xong:**

- Một Worker tên **`my-blog`** phục vụ toàn bộ site tĩnh (thư mục `dist/` do Astro build ra) — request tới file tĩnh
  **miễn phí, không giới hạn**.
- Một API nhỏ dưới `/api/*` (mã trong `worker/`) cho **lượt xem**, **cảm xúc (reactions)** và **đăng ký bản tin**,
  lưu trong database **D1** (SQLite của Cloudflare).
- Tuỳ chọn: tên miền riêng, Web Analytics (thống kê không cookie), Turnstile (chống spam), bình luận Giscus.

```
Trình duyệt ──► Cloudflare ──┬─► /bai-viet/…, /_astro/…, ảnh…  → file tĩnh trong dist/ (không chạy Worker, miễn phí)
                             └─► /api/*                         → worker/index.ts ──► D1 "blog-db"
```

Cấu hình nằm trong [`wrangler.jsonc`](../wrangler.jsonc): tên Worker, thư mục `dist`, `run_worker_first: ["/api/*"]`,
database D1, giới hạn tần suất ghi và lịch dọn dẹp hằng ngày.

> Giao diện Cloudflare thỉnh thoảng đổi tên mục. Nếu không thấy đúng chữ như trong hướng dẫn, hãy tìm mục có ý nghĩa
> gần nhất. Lệnh `npx wrangler …` thì ổn định hơn giao diện.

## Mục lục

0. [Chuẩn bị](#0-chuẩn-bị)
1. [Tạo tài khoản Cloudflare](#1-tạo-tài-khoản-cloudflare)
2. [Đẩy code lên GitHub](#2-đẩy-code-lên-github)
3. [Đăng nhập Wrangler trên máy](#3-đăng-nhập-wrangler-trên-máy)
4. [Tạo database D1](#4-tạo-database-d1)
5. [Tạo bảng bằng migrations](#5-tạo-bảng-bằng-migrations)
6. [Kết nối repo bằng Workers Builds](#6-kết-nối-repo-bằng-workers-builds)
7. [Đặt secrets](#7-đặt-secrets)
8. [Cập nhật địa chỉ site](#8-cập-nhật-địa-chỉ-site)
9. [Kiểm tra sau khi deploy](#9-kiểm-tra-sau-khi-deploy)
10. [Tên miền riêng](#10-tên-miền-riêng)
11. [Web Analytics](#11-web-analytics)
12. [Turnstile chống spam](#12-turnstile-chống-spam)
13. [Bình luận Giscus](#13-bình-luận-giscus)
14. [Danh sách email bản tin](#14-danh-sách-email-bản-tin)
15. [Giới hạn gói Free](#15-giới-hạn-gói-free)
16. [Chạy thử API trên máy](#16-chạy-thử-api-trên-máy)
17. [Xử lý sự cố thường gặp](#17-xử-lý-sự-cố-thường-gặp)
18. [Không dùng backend](#18-không-dùng-backend)

Bước 0–9 là bắt buộc để có site chạy đủ tính năng; bước 10–14 tuỳ chọn, làm lúc nào cũng được.

---

## 0. Chuẩn bị

- **Node.js 24** (đúng phiên bản trong file [`.nvmrc`](../.nvmrc)) và **Git**.
- Trong thư mục dự án, chạy thử một lần cho chắc:

  ```bash
  npm ci
  npm run build
  ```

  Thấy dòng `Complete!` và thư mục `dist/` xuất hiện là được.

> **Windows:** các lệnh trong hướng dẫn chạy được trong PowerShell lẫn Git Bash. Riêng `curl` trong Windows
> PowerShell là một lệnh khác — hãy gõ **`curl.exe`** thay cho `curl`.

## 1. Tạo tài khoản Cloudflare

1. Vào <https://dash.cloudflare.com/sign-up>, đăng ký bằng email và mật khẩu.
2. Mở email xác nhận Cloudflare gửi tới và bấm vào liên kết xác minh.
3. Gói **Free** là đủ cho blog này — không cần thẻ thanh toán.
4. Lần đầu mở **Workers & Pages**, Cloudflare có thể hỏi bạn chọn một **subdomain** cho `workers.dev`
   (ví dụ `ten-ban`). Site sẽ có địa chỉ `https://my-blog.ten-ban.workers.dev`.

## 2. Đẩy code lên GitHub

1. Tạo repo mới trên <https://github.com/new> (ví dụ `my_blog`). **Không** tick "Add a README" — dự án đã có sẵn.
   - Muốn dùng bình luận Giscus thì repo phải **public**. Các phần khác chạy được với repo private.
2. Trong thư mục dự án:

   ```bash
   git remote add origin https://github.com/<tên-bạn>/my_blog.git
   git push -u origin main
   ```

> File `.dev.vars` (chứa secret khi chạy trên máy) đã nằm trong `.gitignore`. **Đừng bao giờ commit secret.**
> `database_id`, khoá công khai Turnstile và token Web Analytics thì công khai được, commit thoải mái.

## 3. Đăng nhập Wrangler trên máy

Wrangler là công cụ dòng lệnh của Cloudflare, đã có sẵn trong `devDependencies` (không cần cài thêm).

```bash
npx wrangler login     # mở trình duyệt → bấm "Allow" để cấp quyền
npx wrangler whoami    # kiểm tra: in ra email và Account ID của bạn
```

## 4. Tạo database D1

```bash
npx wrangler d1 create blog-db --location apac --binding DB --update-config
```

- `blog-db` là tên database — giữ nguyên, vì `wrangler.jsonc` và các script `npm run db:*` dùng tên này.
- `--location apac` đặt database ở khu vực châu Á – Thái Bình Dương, gần bạn đọc Việt Nam.
- `--binding DB --update-config` để Wrangler **tự điền `database_id` thật** vào mục `d1_databases` trong
  `wrangler.jsonc` (thay cho chuỗi `00000000-0000-0000-0000-000000000000`).

Mở `wrangler.jsonc` để kiểm tra: `database_id` giờ là một chuỗi UUID khác số 0. Sau đó commit:

```bash
git add wrangler.jsonc
git commit -m "chore: D1 database id"
git push
```

> Lỡ chạy lệnh mà thiếu `--update-config`? Lệnh in ra `database_id`; bạn tự chép vào `wrangler.jsonc` là được.
> Quên ID thì xem lại bằng `npx wrangler d1 list`.

## 5. Tạo bảng bằng migrations

Cấu trúc bảng nằm trong thư mục [`migrations/`](../migrations) (`0001_init.sql`: lượt xem, cảm xúc, chống đếm trùng,
người đăng ký bản tin).

```bash
npm run db:migrate:local    # database trên máy, dùng khi chạy thử
npm run db:migrate:remote   # database thật trên Cloudflare — Wrangler hỏi xác nhận, gõ y
```

Kiểm tra database thật đã có bảng:

```bash
npx wrangler d1 execute blog-db --remote --command "SELECT name FROM sqlite_master WHERE type = 'table'"
```

Kết quả cần có `page_views`, `reactions`, `dedupe`, `subscribers` (cùng `d1_migrations` do Wrangler tạo).

> **Luôn chạy migrations remote từ máy của bạn**, đừng thêm vào lệnh build/deploy. Token mặc định mà Workers Builds
> tự tạo **không có quyền D1**, nên lệnh migrations chạy trên đó sẽ báo lỗi xác thực.
> Sau này có file mới trong `migrations/`, hãy chạy lại `npm run db:migrate:remote` **trước khi** push đoạn code cần
> tới bảng mới.

## 6. Kết nối repo bằng Workers Builds

Workers Builds là dịch vụ build của Cloudflare: mỗi lần bạn push lên GitHub, Cloudflare tự build rồi deploy.

1. Vào <https://dash.cloudflare.com> → **Workers & Pages** → **Create** (Create application).
2. Chọn **Import a repository** → **Connect GitHub** (lần đầu) → cho phép Cloudflare truy cập repo blog
   (chỉ chọn repo này là đủ) → chọn repo.
3. Điền cấu hình:

   | Ô | Giá trị |
   |---|---|
   | **Project name** (tên Worker) | `my-blog` — **phải trùng** với `"name"` trong `wrangler.jsonc` |
   | **Build command** | `npm run build` |
   | **Deploy command** | `npx wrangler deploy` |
   | Non-production branch deploy command | để mặc định (`npx wrangler versions upload`) |
   | Root directory / Path | để trống (gốc repo) |

   - **Node.js:** Workers Builds tự đọc phiên bản trong `.nvmrc` (Node 24), bạn không phải chỉnh gì.
     Dependencies được cài tự động theo `package-lock.json`.
   - **Build variables** (tuỳ chọn, ở mục *Advanced settings* hoặc sau này trong *Settings → Build → Variables and
     secrets*): `SITE_URL` (địa chỉ site, xem [bước 8](#8-cập-nhật-địa-chỉ-site)) và `PUBLIC_CF_ANALYTICS_TOKEN` (xem
     [bước 11](#11-web-analytics)). Đây là biến **lúc build**, khác với secret lúc chạy ở bước 7.
4. Bấm **Deploy** (Save and Deploy). Lần build đầu mất vài phút; theo dõi log ngay trên trang.
5. Xong, mở `https://my-blog.<subdomain>.workers.dev` — site đã lên.

Từ giờ: push lên nhánh `main` → tự deploy bản chính thức. Push nhánh khác → Cloudflare tạo một **bản xem trước**
(preview URL) mà không đụng tới bản chính.

> Bản xem trước dùng **chung database D1** với bản chính: lượt xem, cảm xúc và email gửi từ đó cũng vào database thật.

> **Đã có sẵn Worker `my-blog`** (ví dụ từng chạy `npm run deploy` hoặc `wrangler secret put` trước)? Đừng tạo mới;
> vào **Workers & Pages → my-blog → Settings → Build → Connect** để nối repo vào Worker đó.

## 7. Đặt secrets

Secret là giá trị bí mật, chỉ Worker đọc được; **không** nằm trong code hay trong `wrangler.jsonc`.
Đặt sau khi Worker đã tồn tại (sau bước 6). Secret có hiệu lực ngay, không cần build lại.

### `DEEPSEEK_API_KEY` — tuỳ chọn (trợ lý AI ở trang viết bài)

Bật trợ lý AI trên `/viet-bai/`. Tạo khoá tại <https://platform.deepseek.com/api_keys> (cần nạp số dư), rồi:

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

Khoá chỉ nằm trên Cloudflare — không có trong mã nguồn hay trình duyệt. Endpoint `/api/ai` chỉ phục vụ người có token
GitHub **ghi được** vào repo khai báo ở `GITHUB_REPO` (wrangler.jsonc), nên người lạ không dùng chùa được khoá của bạn.
Kiểm tra: `https://<domain>/api/health` phải có `"ai":true`. Đổi model bằng biến `DEEPSEEK_MODEL` (mặc định `deepseek-flash`).

### `HASH_SALT` — bắt buộc

Worker không lưu IP hay thông tin cá nhân của bạn đọc. Để chống đếm trùng, nó chỉ giữ một mã băm ẩn danh đổi mỗi ngày:
`SHA-256(ngày | IP | trình duyệt | HASH_SALT)`. Thiếu `HASH_SALT`, Worker **từ chối ghi** lượt xem và
cảm xúc (trả 503; trang vẫn đọc bình thường) — vì mã nguồn công khai, một chuỗi mặc định sẽ cho phép dò ngược mã băm ra IP.
Kiểm tra nhanh: mở `https://<domain>/api/health`, phải thấy `"salt":true`.

```bash
# 1) Tạo một chuỗi ngẫu nhiên dài:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 2) Đặt secret (Wrangler hỏi giá trị → dán chuỗi vừa tạo → Enter):
npx wrangler secret put HASH_SALT
```

### `TURNSTILE_SECRET` — tuỳ chọn

Chỉ cần khi bật Turnstile — làm theo [bước 12](#12-turnstile-chống-spam) (thứ tự đặt khoá ở đó rất quan trọng).

Xem danh sách secret đã đặt (chỉ hiện tên, không hiện giá trị):

```bash
npx wrangler secret list
```

> Cũng có thể đặt trên dashboard: **my-blog → Settings → Variables and Secrets → Add**, chọn kiểu **Secret**.

## 8. Cập nhật địa chỉ site

Địa chỉ site được dùng cho link canonical, sitemap, RSS và ảnh chia sẻ (OG). Khi đã biết địa chỉ thật
(`https://my-blog.<subdomain>.workers.dev` hoặc tên miền riêng ở bước 10 — blog này dùng `https://githenhi.com`):

1. Sửa `SITE.url` trong [`src/config.ts`](../src/config.ts) — hoặc đặt build variable `SITE_URL` trong Workers Builds
   (biến này được ưu tiên hơn `SITE.url`).
2. Nếu dùng CMS: sửa `site_url` trong `public/admin/config.yml` cho khớp.
3. Commit và push.

## 9. Kiểm tra sau khi deploy

Thay `<site>` bằng địa chỉ của bạn (Windows PowerShell: dùng `curl.exe`).

```bash
curl https://<site>/api/health
# → {"ok":true,"db":true}

curl "https://<site>/api/stats?slug=llm-hoat-dong-the-nao"
# → {"slug":"llm-hoat-dong-the-nao","views":0,"reactions":{"like":0,"love":0,"fire":0,"mindblown":0,"clap":0}}
```

- `"db":false` → Worker chưa nối được D1 (xem [Xử lý sự cố](#17-xử-lý-sự-cố-thường-gặp)).
- `slug` là tên thư mục của bài trong `/bai-viet/<slug>/`.

Thử trên trình duyệt:

1. Mở một bài viết, **để tab mở ít nhất 10 giây** (hoặc cuộn qua khoảng 30% bài) → tải lại trang: dòng
   "1 lượt xem" xuất hiện cạnh thời gian đọc.
2. Cuối bài, bấm một biểu tượng cảm xúc → số tăng ngay; tải lại trang vẫn giữ lựa chọn. Bấm lần nữa để bỏ chọn.
3. Nhập email vào ô bản tin → "Đã đăng ký thành công!". Nhập lại đúng email đó → "Email này đã đăng ký rồi."

Xem dữ liệu trong database thật:

```bash
npx wrangler d1 execute blog-db --remote --command "SELECT * FROM page_views ORDER BY views DESC LIMIT 10"
```

> Thử `POST` bằng `curl` sẽ nhận lỗi **403** — đó là đúng: API chỉ nhận yêu cầu ghi gửi từ chính trang blog
> (kiểm tra header `Origin`).

**Xem log của Worker:** dashboard → **my-blog → Observability** (đã bật sẵn trong `wrangler.jsonc`), hoặc xem trực
tiếp từ máy bằng `npx wrangler tail`.

## 10. Tên miền riêng

Tên miền (ví dụ `githenhi.com`) **phải được quản lý trên Cloudflare** thì mới gắn vào Worker được.

1. Dashboard → **Add a domain** (Add a site) → nhập tên miền → chọn gói **Free**.
2. Cloudflare đưa cho bạn 2 **nameserver**. Vào trang quản lý tên miền nơi bạn mua (Mắt Bão, PA Việt Nam, iNET,
   Namecheap…) và thay nameserver bằng 2 giá trị đó. Có thể mất vài phút tới 24 giờ; Cloudflare gửi email khi xong.
3. **Workers & Pages → my-blog → Settings → Domains & Routes → Add → Custom domain** → nhập `githenhi.com`
   (thêm `www.githenhi.com` nếu muốn cả bản có www). Cloudflare tự tạo bản ghi DNS và chứng chỉ HTTPS.
4. Cập nhật địa chỉ site như [bước 8](#8-cập-nhật-địa-chỉ-site).
5. Nếu dùng Web Analytics/Turnstile: thêm tên miền mới vào danh sách hostname của chúng.
6. Tuỳ chọn: ở cùng trang *Domains & Routes*, tắt `workers.dev` để chỉ còn một địa chỉ (link canonical vốn đã trỏ về
   `SITE.url`).

## 11. Web Analytics

Thống kê lượt truy cập **không cookie**, không theo dõi cá nhân, miễn phí.

1. Dashboard → **Analytics & Logs → Web Analytics → Add a site**.
2. Nhập hostname (tên miền riêng, hoặc `my-blog.<subdomain>.workers.dev`) → hoàn tất.
3. Cloudflare hiện một đoạn mã JS có dạng `data-cf-beacon='{"token": "abc123…"}'`. Chép **token** (chỉ chuỗi trong
   ngoặc kép).
4. Dán vào `ANALYTICS.cloudflareToken` trong [`src/config.ts`](../src/config.ts) rồi push — **hoặc** đặt build variable
   `PUBLIC_CF_ANALYTICS_TOKEN` trong Workers Builds rồi build lại.

Script chỉ được chèn vào bản build production (không chạy khi `npm run dev`). Số liệu xuất hiện sau vài phút ở trang
Web Analytics.

> Nếu Cloudflare đề nghị "automatic setup" (tự chèn script) cho tên miền của bạn, chỉ dùng **một** cách: hoặc tự
> động, hoặc token trong `src/config.ts` — dùng cả hai sẽ đếm gấp đôi.

## 12. Turnstile chống spam

Form bản tin đã có sẵn bẫy bot đơn giản (một ô ẩn) và giới hạn tần suất. Turnstile là lớp chống bot của Cloudflare,
thường **vô hình** với người đọc thật — bật khi bắt đầu thấy email rác.

1. Dashboard → **Turnstile → Add widget**.
   - Widget name: `Bản tin Gì thế nhỉ`.
   - Hostnames: tên miền của bạn (ví dụ `githenhi.com`) và/hoặc `my-blog.<subdomain>.workers.dev`.
   - Widget mode: **Managed**.
2. Bấm **Create** → nhận **Site Key** (công khai) và **Secret Key** (bí mật).
3. **Làm theo đúng thứ tự:**
   1. Dán Site Key vào `TURNSTILE.siteKey` trong [`src/config.ts`](../src/config.ts) → push → **chờ deploy xong**.
   2. Sau đó mới đặt khoá bí mật:

      ```bash
      npx wrangler secret put TURNSTILE_SECRET
      ```

   Làm ngược lại (đặt secret khi trang chưa có Site Key) thì **mọi** lượt đăng ký đều bị từ chối với thông báo
   "Chưa xác minh được bạn là người thật".

Muốn tắt Turnstile: xoá secret **trước** (`npx wrangler secret delete TURNSTILE_SECRET`), rồi mới xoá Site Key.

> Thử Turnstile trên máy: dùng khoá thử của Cloudflare — Site Key `1x00000000000000000000AA`, secret
> `1x0000000000000000000000000000000AA` (luôn hợp lệ) đặt trong `.dev.vars`. **Không commit khoá thử** vào
> `src/config.ts`.

## 13. Bình luận Giscus

Bình luận lưu trên **GitHub Discussions** của repo, người đọc đăng nhập bằng GitHub. Không cần database.

1. Repo trên GitHub phải **public**.
2. Bật Discussions: repo → **Settings → General → Features** → tick **Discussions**.
3. Cài app giscus cho repo: <https://github.com/apps/giscus> → **Install** → chọn **Only select repositories** →
   chọn repo blog.
4. Vào <https://giscus.app/vi> (nhãn tiếng Anh trong ngoặc, phòng khi trang hiện tiếng Anh):
   - Ô **Kho lưu trữ** (*Repository*): nhập `<tên-bạn>/<tên-repo>` → phải báo repo đạt đủ điều kiện.
   - **Ánh xạ trang ↔ discussion** (*Page ↔ Discussions Mapping*): chọn `pathname` (khớp với cấu hình sẵn).
   - **Danh mục Discussion** (*Discussion Category*): chọn **Announcements** (chỉ bạn và giscus tạo được discussion
     mới — tránh spam).
   - Kéo xuống phần **Bật giscus** (*Enable giscus*): trong đoạn `<script>` có `data-repo`, `data-repo-id`,
     `data-category`, `data-category-id`.
5. Chép 4 giá trị đó vào `GISCUS` trong [`src/config.ts`](../src/config.ts):

   ```ts
   export const GISCUS = {
     repo: 'ten-ban/ten-repo',
     repoId: 'R_kgDO…',
     category: 'Announcements',
     categoryId: 'DIC_kwDO…',
     mapping: 'pathname',
     lang: 'vi',
   } as const;
   ```

6. Push. Khung bình luận xuất hiện cuối mỗi bài, tự đổi sáng/tối theo giao diện blog.

- Chưa điền đủ thì bản production **không hiện gì**; khi `npm run dev` bạn sẽ thấy một hộp gợi ý viền đứt.
- Tắt bình luận cho riêng một bài: thêm `comments: false` vào frontmatter của bài đó.
- Ánh xạ `pathname` nghĩa là **đổi đường dẫn bài** thì bài đó sẽ bắt đầu một luồng bình luận mới.

## 14. Danh sách email bản tin

Worker **chỉ thu thập** email (gói Free không gửi email được). Để gửi bản tin, bạn xuất danh sách rồi nhập vào một
dịch vụ gửi thư (Buttondown, MailerLite, Brevo…).

Xem nhanh:

```bash
npx wrangler d1 execute blog-db --remote --command "SELECT email, created_at FROM subscribers"
```

Xuất ra file CSV — lưu **ra ngoài thư mục dự án** (`../`) để không lỡ commit email của bạn đọc:

```bash
# Git Bash / macOS / Linux:
npx wrangler d1 execute blog-db --remote --json --command "SELECT email, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at" > ../subscribers.json
```

```powershell
# Windows PowerShell:
npx wrangler d1 execute blog-db --remote --json --command "SELECT email, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at" | Out-File -Encoding utf8 ../subscribers.json
```

Rồi chuyển sang CSV (chạy được ở cả hai):

```bash
node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('../subscribers.json','utf8').replace(/^﻿/,''))[0].results;fs.writeFileSync('../subscribers.csv','email,created_at\n'+r.map(x=>x.email+','+x.created_at).join('\n')+'\n')"
```

Sao lưu cả bảng (file SQL):

```bash
npx wrangler d1 export blog-db --remote --table subscribers --output ../subscribers-backup.sql
```

Khi có người xin huỷ hoặc xoá email:

```bash
# Huỷ đăng ký (giữ lại để biết họ đã từ chối):
npx wrangler d1 execute blog-db --remote --command "UPDATE subscribers SET status = 'unsubscribed' WHERE email = 'ban@example.com'"
# Xoá hẳn theo yêu cầu:
npx wrangler d1 execute blog-db --remote --command "DELETE FROM subscribers WHERE email = 'ban@example.com'"
```

Người đã huỷ mà đăng ký lại qua form sẽ tự được chuyển về `active`.

## 15. Giới hạn gói Free

Số liệu tại thời điểm viết (11/2026) — xem lại ở trang giá của Cloudflare nếu cần chắc chắn. Hạn mức theo ngày được
làm mới lúc **00:00 UTC (7:00 sáng giờ Việt Nam)**.

| Dịch vụ | Hạn mức Free | Với blog này |
|---|---|---|
| **Workers** | 100.000 request/ngày, 10 ms CPU mỗi request | Chỉ request `/api/*` được tính. **File tĩnh (trang, ảnh, CSS, JS) miễn phí và không tính.** Mỗi lượt đọc bài tốn tối đa 2 request API (lấy số liệu + ghi lượt xem; chưa tính bấm cảm xúc, đăng ký) → khoảng 50.000 lượt đọc/ngày. |
| **D1** | 5 triệu dòng đọc/ngày, 100.000 dòng ghi/ngày, 5 GB tổng (500 MB mỗi database) | Một lượt xem/cảm xúc **được đếm** tốn khoảng 3 dòng ghi (ghi nhận, tăng bộ đếm, dọn dẹp hôm sau) → khoảng 30.000 lượt/ngày. Lượt trùng (cùng người, cùng bài, cùng ngày) tốn 0 dòng ghi. |
| Rate limiting | Miễn phí | 20 lần ghi / 60 giây / IP cho mỗi API. |
| Cron Triggers | Miễn phí | Dọn bảng chống đếm trùng lúc 03:17 UTC mỗi ngày. |
| Workers Builds | Có hạn mức phút build mỗi tháng, 1 build cùng lúc | Mỗi lần build blog mất vài phút. |
| Web Analytics, Turnstile | Miễn phí | |

**Lỡ vượt hạn mức?** Trang tĩnh **vẫn chạy bình thường** (không đi qua Worker). Chỉ `/api/*` báo lỗi tới hết ngày, và
giao diện tự ẩn số lượt xem, khối cảm xúc — bạn đọc không thấy trang hỏng.

## 16. Chạy thử API trên máy

```bash
cp .dev.vars.example .dev.vars    # rồi sửa HASH_SALT trong .dev.vars thành chuỗi ngẫu nhiên
npm run db:migrate:local
```

| Lệnh | Dùng khi |
|---|---|
| `npm run preview` | Build rồi chạy y như production (site + API) tại <http://localhost:8787>. |
| `npm run dev:all` | Viết bài/sửa giao diện có tự tải lại (<http://localhost:4321>) **và** có API. Cần `ALLOWED_ORIGINS` trong `.dev.vars` (đã có sẵn trong file mẫu). |
| `npm run dev` | Chỉ giao diện, không API — lượt xem/cảm xúc tự ẩn, form bản tin báo mất kết nối. Bình thường. |

Kiểm tra API tự động (41 bước) khi `npm run preview` đang chạy, ở một cửa sổ terminal khác:

```bash
node scripts/test-api.mjs http://localhost:8787
node scripts/test-api.mjs http://localhost:8787 --burst   # thêm bài kiểm tra giới hạn tần suất (chạy sau cùng)
```

Dữ liệu thử nằm trong `.wrangler/` trên máy, không ảnh hưởng database thật.

## 17. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Build/deploy báo tên trong file cấu hình phải trùng tên Worker (*must match the name of your Worker*) | Tên Worker trên Cloudflare khác `"name": "my-blog"` trong `wrangler.jsonc` | Tạo lại Worker với tên đúng `my-blog`, **hoặc** đổi `"name"` trong `wrangler.jsonc` cho trùng tên Worker rồi push (địa chỉ `workers.dev` đổi theo). |
| Deploy báo thư mục `assets.directory` / `dist` không tồn tại | Thiếu hoặc sai **Build command**, nên chưa có `dist/` | *my-blog → Settings → Build* → Build command = `npm run build` → build lại. |
| Build lỗi khi cài package hoặc sai phiên bản Node | Thiếu `package-lock.json` hoặc `.nvmrc` trong repo | Commit cả hai file. Vẫn lỗi: thêm build variable `NODE_VERSION` = `24`. |
| Deploy báo lỗi về D1 / `database_id` | Chưa làm bước 4, hoặc chưa push `wrangler.jsonc` có `database_id` thật | Làm lại [bước 4](#4-tạo-database-d1), commit, push. |
| Lệnh migrations trong Workers Builds báo lỗi xác thực / không có quyền | Token mặc định của Workers Builds không có quyền D1 | Bỏ migrations khỏi lệnh build/deploy; chạy `npm run db:migrate:remote` từ máy. |
| `/api/...` trả về **trang 404** (HTML) | Đang chạy `npm run dev` / `astro preview`, hoặc đưa `dist/` lên host tĩnh (Cloudflare Pages, GitHub Pages…) — không có Worker | Dùng `npm run preview` khi thử trên máy; khi deploy, dùng Worker như hướng dẫn này. Giữ `run_worker_first: ["/api/*"]` trong `wrangler.jsonc`. |
| `/api/health` trả `{"ok":true,"db":false}` | Worker không có binding D1 tên `DB` | Kiểm tra mục `d1_databases` trong `wrangler.jsonc` (binding phải là `"DB"`), push lại. |
| API trả **500** "Máy chủ đang gặp trục trặc…", log có `no such table` | Chưa tạo bảng trên database thật | `npm run db:migrate:remote`. |
| API trả **403** "Yêu cầu bị từ chối vì không đến từ trang Gì thế nhỉ." | Yêu cầu ghi đến từ một địa chỉ khác địa chỉ của Worker (trang mở ở domain khác, `astro dev` ở cổng 4321 thiếu `ALLOWED_ORIGINS`, hoặc `curl` không gửi `Origin`) | Thêm địa chỉ đó (đầy đủ `https://…`, cách nhau bằng dấu phẩy) vào `vars.ALLOWED_ORIGINS` trong `wrangler.jsonc`; trên máy thì thêm vào `.dev.vars`. API cố ý không hỗ trợ CORS. |
| API trả **429** "Bạn thao tác hơi nhanh…" | Quá 20 lần ghi trong 60 giây từ cùng một IP (văn phòng, trường học, mạng di động có thể dùng chung IP) | Chờ một phút. Muốn nới: tăng `limit` trong mục `ratelimits` của `wrangler.jsonc` (`period` chỉ nhận 10 hoặc 60), hoặc xoá cả mục để tắt. |
| Lượt xem không tăng | Chỉ đếm sau ≥10 giây đọc hoặc cuộn ≥30% bài; mỗi người mỗi bài chỉ tính 1 lần/ngày; số liệu được cache 30 giây | Thử bằng trình duyệt/thiết bị khác, hoặc chờ sang ngày. |
| Form bản tin: "Chưa xác minh được bạn là người thật" | Đã đặt `TURNSTILE_SECRET` nhưng trang chưa có Site Key, hoặc hostname chưa nằm trong widget Turnstile | Xem thứ tự ở [bước 12](#12-turnstile-chống-spam); kiểm tra danh sách Hostnames. |
| Form bản tin: "Mất kết nối tới máy chủ…" | Trang không gọi được API (chạy `npm run dev`, host tĩnh, hoặc Worker lỗi) | Xem `curl https://<site>/api/health`, rồi xem log ở *Observability*. |
| Không tạo được Worker `my-blog` khi Import repository vì tên đã tồn tại | Worker đã được tạo trước đó (`wrangler deploy` / `wrangler secret put` từ máy) | Vào *my-blog → Settings → Build → Connect* để nối repo vào Worker có sẵn. |
| Lệnh `wrangler` báo chưa đăng nhập / chọn sai tài khoản | Hết phiên đăng nhập, hoặc email có nhiều tài khoản Cloudflare | `npx wrangler login`; nhiều tài khoản thì đặt biến môi trường `CLOUDFLARE_ACCOUNT_ID`. |

Vẫn chưa ra? Xem log: dashboard → *my-blog → Observability*, hoặc `npx wrangler tail` rồi thao tác lại trên trang.

## 18. Không dùng backend

Chỉ muốn một blog tĩnh, không lượt xem/cảm xúc/bản tin:

1. Trong [`src/config.ts`](../src/config.ts), đặt `views`, `reactions`, `newsletter` trong `SITE.features` thành `false`.
2. Trong `wrangler.jsonc`, xoá mục `d1_databases` (không cần tạo D1), có thể xoá luôn `ratelimits` và `triggers`.
3. Bỏ qua các bước 4, 5, 7. Worker vẫn deploy được và phục vụ site tĩnh như bình thường.

Muốn bật lại sau này: làm bước 4, 5, 7 rồi đặt `features` về `true`.
