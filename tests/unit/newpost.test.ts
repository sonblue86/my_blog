import { describe, it, expect } from 'vitest';
// Đúng bộ đọc frontmatter mà Astro dùng khi build (dependency trực tiếp của dự án).
import { parseFrontmatter } from '@astrojs/markdown-remark';
import {
  SLUG_MAX_LENGTH,
  buildPost,
  findConflicts,
  normalizeCategory,
  parseArgs,
  parseTags,
  postFilePath,
  slugify,
  todayIn,
  yamlString,
} from '../../scripts/lib/new-post-core.mjs';
import { slugify as siteSlugify } from '../../src/lib/text';

describe('slugify (script tạo bài)', () => {
  it('bỏ dấu tiếng Việt, kể cả đ/Đ', () => {
    expect(slugify('Đường đến Đà Lạt: ăn gì, ở đâu?')).toBe('duong-den-da-lat-an-gi-o-dau');
    expect(slugify('Ứng dụng AI trong đời sống')).toBe('ung-dung-ai-trong-doi-song');
  });

  it('gộp ký hiệu thành một dấu "-" và bỏ "-" ở hai đầu', () => {
    expect(slugify('  "GPT-5" & Claude — so sánh!!  ')).toBe('gpt-5-claude-so-sanh');
  });

  it('khớp với slugify() của site (src/lib/text.ts) cho tiêu đề ngắn', () => {
    const titles = [
      'Trí tuệ nhân tạo đang thay đổi Đà Nẵng?',
      'Prompt hiệu quả: 10 mẹo cho người mới',
      'It’s 2026 — “AI agent” là gì?',
      'Nghỉ ngơi đúng cách (phần 2)',
      'Ăn, ngủ, đọc — lặp lại',
    ];
    for (const t of titles) expect(slugify(t)).toBe(siteSlugify(t));
  });

  it(`giới hạn ${SLUG_MAX_LENGTH} ký tự và cắt ở ranh giới từ`, () => {
    const long = 'Hướng dẫn chi tiết từng bước cách xây dựng một blog cá nhân thật nhanh với Astro và Cloudflare miễn phí trọn đời';
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(siteSlugify(long).startsWith(slug)).toBe(true);
    // Ký tự ngay sau phần bị cắt phải là "-": không cụt giữa một từ.
    expect(siteSlugify(long)[slug.length]).toBe('-');
    expect(slug.endsWith('-')).toBe(false);
  });

  it('cắt cứng khi một "từ" dài hơn giới hạn', () => {
    expect(slugify('a'.repeat(120))).toBe('a'.repeat(SLUG_MAX_LENGTH));
  });

  it('trả về chuỗi rỗng khi không có chữ/số', () => {
    expect(slugify('!!! ??? ***')).toBe('');
  });
});

describe('yamlString', () => {
  it('luôn dùng nháy đơn và nhân đôi nháy đơn bên trong', () => {
    expect(yamlString("It's ok")).toBe("'It''s ok'");
    expect(yamlString('Câu hỏi: "AI là gì?"')).toBe(`'Câu hỏi: "AI là gì?"'`);
  });

  it('gộp xuống dòng thành khoảng trắng', () => {
    expect(yamlString('Dòng 1\r\n  Dòng 2\nDòng 3')).toBe("'Dòng 1 Dòng 2 Dòng 3'");
  });
});

describe('buildPost → frontmatter đọc lại đúng bằng parser của Astro', () => {
  const tricky = [
    'Đừng hỏi: "AI có thay thế tôi?" — It\'s complicated',
    'yes',
    '#1: Bắt đầu từ đâu?',
    '- Gạch đầu dòng: [mảng] {đối tượng} & *sao* @at `code` | ống > lớn %',
    "''nháy đơn kép''",
    '2026-11-09',
    'null',
  ];

  for (const title of tricky) {
    it(`giữ nguyên tiêu đề: ${title}`, () => {
      const file = buildPost({ title, category: 'ai', tags: ['A: B', "It's"], date: '2026-11-09' });
      const { frontmatter } = parseFrontmatter(file);
      expect(frontmatter.title).toBe(title);
      expect(frontmatter.tags).toEqual(['A: B', "It's"]);
    });
  }

  it('có đủ trường bắt buộc của schema, là bản nháp, và chú thích các trường tuỳ chọn', () => {
    const file = buildPost({ title: 'Xin chào', category: 'doi-song', date: '2026-11-09' });
    const fm = parseFrontmatter(file).frontmatter as Record<string, unknown>;
    expect(fm).toMatchObject({ title: 'Xin chào', category: 'doi-song', draft: true, tags: [] });
    expect(typeof fm.description).toBe('string');
    expect((fm.description as string).length).toBeGreaterThan(0);
    expect((fm.description as string).length).toBeLessThanOrEqual(300);
    // YAML đọc "2026-11-09" thành Date hoặc chuỗi — z.coerce.date() nhận cả hai.
    expect(new Date(fm.pubDate as string).toISOString().slice(0, 10)).toBe('2026-11-09');
    expect(fm.summary).toBeTypeOf('string');
    expect(fm.takeaways).toHaveLength(3);
    for (const optional of ['updatedDate', 'cover', 'coverAlt', 'series', 'seriesOrder', 'featured', 'comments']) {
      expect(fm).not.toHaveProperty(optional);
      expect(file).toMatch(new RegExp(`^# ${optional}:`, 'm'));
    }
  });

  it('dùng chú thích HTML cho .md và chú thích JSX cho .mdx (HTML comment làm hỏng MDX)', () => {
    const md = buildPost({ title: 'A', category: 'ai', date: '2026-11-09' });
    const mdx = buildPost({ title: 'A', category: 'ai', date: '2026-11-09', mdx: true });
    expect(md).toContain('<!--');
    expect(mdx).not.toContain('<!--');
    expect(mdx).toContain('{/*');
  });
});

describe('todayIn (giờ Việt Nam)', () => {
  it('qua nửa đêm UTC+7 là đã sang ngày mới dù UTC vẫn là hôm trước', () => {
    expect(todayIn(new Date('2026-11-08T16:59:59Z'))).toBe('2026-11-08');
    expect(todayIn(new Date('2026-11-08T17:00:00Z'))).toBe('2026-11-09');
  });
  it('định dạng YYYY-MM-DD có số 0 đứng đầu', () => {
    expect(todayIn(new Date('2026-01-04T03:00:00Z'))).toBe('2026-01-04');
  });
});

describe('parseTags', () => {
  it('tách theo dấu phẩy, bỏ trống và bỏ trùng không phân biệt hoa/thường/dấu', () => {
    expect(parseTags('AI, ai,  Năng suất , nang suat,, ')).toEqual(['AI', 'Năng suất']);
  });
  it('nhận mảng (nhiều lần --tags)', () => {
    expect(parseTags(['A, B', 'C'])).toEqual(['A', 'B', 'C']);
  });
  it('rỗng khi không có gì', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('  , ')).toEqual([]);
  });
});

describe('normalizeCategory', () => {
  it.each([
    ['ai', 'ai'],
    ['AI', 'ai'],
    ['cong-nghe', 'cong-nghe'],
    ['Công nghệ', 'cong-nghe'],
    ['cong nghe', 'cong-nghe'],
    ['Đời sống', 'doi-song'],
    ['1', 'ai'],
    ['3', 'doi-song'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeCategory(input)).toBe(expected);
  });
  it.each(['', '0', '4', 'thể thao', undefined, null])('không hợp lệ: %s', (input) => {
    expect(normalizeCategory(input)).toBeNull();
  });
});

describe('parseArgs', () => {
  it('đọc tiêu đề và các tuỳ chọn', () => {
    const a = parseArgs(['Tiêu đề bài', '--category', 'ai', '--mdx', '--tags', 'A, B']);
    expect(a).toMatchObject({ title: 'Tiêu đề bài', category: 'ai', mdx: true, tags: ['A', 'B'], errors: [] });
  });
  it('ghép nhiều từ không đặt trong nháy thành tiêu đề, hỗ trợ --x=y và cờ ngắn', () => {
    const a = parseArgs(['Prompt', 'cho', 'người', 'mới', '-c=doi-song', '-t', 'X']);
    expect(a).toMatchObject({ title: 'Prompt cho người mới', category: 'doi-song', tags: ['X'] });
  });
  it('mọi thứ sau "--" là tiêu đề, kể cả chuỗi bắt đầu bằng "-"', () => {
    expect(parseArgs(['-c', 'ai', '--', '--mdx', 'là', 'gì']).title).toBe('--mdx là gì');
  });
  it('báo lỗi cờ lạ và cờ thiếu giá trị', () => {
    expect(parseArgs(['--bogus']).errors).toHaveLength(1);
    expect(parseArgs(['Tiêu đề', '--category']).errors).toHaveLength(1);
    expect(parseArgs(['--tags', '--mdx']).errors).toHaveLength(1);
  });
  it('không có tiêu đề → undefined', () => {
    expect(parseArgs(['--help'])).toMatchObject({ title: undefined, help: true });
  });
});

describe('đường dẫn và chống ghi đè', () => {
  it('tạo index.md hoặc index.mdx trong thư mục riêng của bài', () => {
    expect(postFilePath('xin-chao', false)).toBe('src/content/posts/xin-chao/index.md');
    expect(postFilePath('xin-chao', true)).toBe('src/content/posts/xin-chao/index.mdx');
  });
  it('phát hiện trùng với thư mục hoặc bài đơn file đã có', () => {
    const existing = new Set(['src/content/posts/a', 'src/content/posts/b.mdx']);
    const exists = (p: string) => existing.has(p);
    expect(findConflicts('a', exists)).toEqual(['src/content/posts/a']);
    expect(findConflicts('b', exists)).toEqual(['src/content/posts/b.mdx']);
    expect(findConflicts('c', exists)).toEqual([]);
  });
});
