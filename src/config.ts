/**
 * Cấu hình chính của blog. Sửa file này để đổi tên, mô tả, mạng xã hội, chuyên mục...
 * Mọi chỗ trong giao diện đều đọc từ đây.
 */

export const SITE = {
  /** Tên blog hiển thị trên header, tiêu đề tab, RSS, OG image. */
  title: 'Nhịp Số',
  /** Khẩu hiệu ngắn. */
  tagline: 'AI, công nghệ & đời sống — viết chậm, đọc sâu.',
  description:
    'Blog tiếng Việt về trí tuệ nhân tạo, công nghệ và đời sống số: giải thích dễ hiểu, hướng dẫn thực hành và những suy ngẫm chậm rãi.',
  /** Đổi thành domain thật khi deploy (cũng có thể đặt qua biến môi trường SITE_URL). */
  url: 'https://nhipso.pages.dev',
  lang: 'vi',
  locale: 'vi_VN',
  /** Tác giả mặc định (id trong src/content/authors). */
  defaultAuthor: 'nhip-so',
  postsPerPage: 12,
  /** Bật/tắt các tính năng cần backend (Cloudflare Worker + D1). Site vẫn chạy tốt nếu API chưa sẵn sàng. */
  features: {
    views: true,
    reactions: true,
    newsletter: true,
  },
} as const;

export const SOCIAL = {
  github: 'https://github.com/',
  facebook: 'https://facebook.com/',
  x: '',
  youtube: '',
  email: '',
} as const;

/**
 * Bình luận qua Giscus (GitHub Discussions). Lấy các giá trị tại https://giscus.app/vi
 * Để trống `repo` để tắt bình luận.
 */
export const GISCUS = {
  repo: '', // ví dụ: 'ten-ban/nhip-so'
  repoId: '',
  category: 'Announcements',
  categoryId: '',
  mapping: 'pathname',
  lang: 'vi',
} as const;

/**
 * Cloudflare Web Analytics — thống kê lượt truy cập không cookie, không theo dõi cá nhân.
 * Lấy token tại dash.cloudflare.com → Analytics & Logs → Web Analytics → Add a site.
 * Để trống để tắt. Script chỉ được chèn vào bản build production (không chạy khi `astro dev`).
 * Có thể đặt qua biến môi trường lúc build: PUBLIC_CF_ANALYTICS_TOKEN.
 */
export const ANALYTICS: { cloudflareToken: string } = {
  cloudflareToken: '',
};

/**
 * Cloudflare Turnstile — chống spam cho form đăng ký bản tin (thường vô hình với người đọc).
 * `siteKey` là khoá công khai; khoá bí mật đặt bằng: npx wrangler secret put TURNSTILE_SECRET
 * Để trống để tắt (form vẫn có honeypot chống bot đơn giản). Xem docs/CLOUDFLARE.md.
 */
export const TURNSTILE: { siteKey: string } = {
  siteKey: '',
};

export type CategoryId = 'ai' | 'cong-nghe' | 'doi-song';

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  /** Emoji/biểu tượng ngắn dùng trong chip và cover tự sinh. */
  icon: string;
  /** Màu nhấn của chuyên mục — tên biến CSS trong global.css (--cat-*) */
  color: string;
}

export const CATEGORIES: Category[] = [
  {
    id: 'ai',
    name: 'AI',
    description: 'Trí tuệ nhân tạo giải thích dễ hiểu: mô hình ngôn ngữ, prompt, agent và cách dùng AI hiệu quả mỗi ngày.',
    icon: '✦',
    color: 'var(--cat-ai)',
  },
  {
    id: 'cong-nghe',
    name: 'Công nghệ',
    description: 'Lập trình, công cụ, bảo mật và những thứ đang thay đổi cách chúng ta làm việc.',
    icon: '⌘',
    color: 'var(--cat-tech)',
  },
  {
    id: 'doi-song',
    name: 'Đời sống',
    description: 'Sống chậm giữa thế giới số: thói quen, năng suất, sức khoẻ tinh thần và những suy ngẫm.',
    icon: '❋',
    color: 'var(--cat-life)',
  },
];

export const NAV = [
  { href: '/', label: 'Trang chủ' },
  ...CATEGORIES.map((c) => ({ href: `/chuyen-muc/${c.id}/`, label: c.name })),
  { href: '/luu-tru/', label: 'Lưu trữ' },
  { href: '/gioi-thieu/', label: 'Giới thiệu' },
] as const;

export function getCategory(id: string): Category {
  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) throw new Error(`Unknown category "${id}". Khai báo trong src/config.ts`);
  return cat;
}
