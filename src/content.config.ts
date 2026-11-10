import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { slugify } from './lib/text';

/**
 * Bài viết: mỗi bài là một thư mục `src/content/posts/<slug>/index.md(x)` — ảnh đặt cùng thư mục.
 * Bài đơn file `src/content/posts/<slug>.md(x)` cũng được hỗ trợ.
 */
const posts = defineCollection({
  loader: glob({
    base: './src/content/posts',
    pattern: '**/[^_]*.{md,mdx}',
    // "slug/index.mdx" -> "slug", "slug.mdx" -> "slug"
    // Always an ASCII slug ("bài-mới/" -> "bai-moi"): clean URLs, and the view/reaction API only accepts [a-z0-9-].
    generateId: ({ entry, data }) =>
      slugify(
        typeof data.slug === 'string' && data.slug
          ? data.slug
          : entry.replace(/\.(md|mdx)$/, '').replace(/\/index$/, ''),
      ),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      description: z.string().min(1).max(300),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      category: z.enum(['ai', 'cong-nghe', 'doi-song']),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      author: reference('authors').optional(),
      /** Bản nháp: không xuất bản khi build production. */
      draft: z.boolean().default(false),
      /** Ghim lên vị trí nổi bật ở trang chủ. */
      featured: z.boolean().default(false),
      /** Tóm tắt nhanh (TL;DR) hiển thị đầu bài. */
      summary: z.string().optional(),
      /** Những ý chính rút ra. */
      takeaways: z.array(z.string()).optional(),
      series: z.string().optional(),
      seriesOrder: z.number().int().positive().optional(),
      /** Tắt bình luận cho riêng bài này. */
      comments: z.boolean().default(true),
      slug: z.string().optional(),
    }),
});

const authors = defineCollection({
  loader: glob({ base: './src/content/authors', pattern: '*.{json,yaml,yml}' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      bio: z.string(),
      avatar: image().optional(),
      role: z.string().optional(),
      links: z
        .object({
          website: z.url().optional(),
          github: z.url().optional(),
          facebook: z.url().optional(),
          x: z.url().optional(),
          linkedin: z.url().optional(),
        })
        .default({}),
    }),
});

export const collections = { posts, authors };
