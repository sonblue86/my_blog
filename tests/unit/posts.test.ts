import { describe, it, expect, vi, afterEach } from 'vitest';

// posts.ts chỉ dùng getCollection lúc chạy; type CollectionEntry bị xoá khi biên dịch.
vi.mock('astro:content', () => ({ getCollection: vi.fn() }));

import { getCollection } from 'astro:content';
import { getSeries, getTags, isPublished, relatedPosts, seriesPosts, type Post } from '../../src/lib/posts';

type Data = Post['data'];

/** Bài giả có hình dạng giống entry của content collection — chỉ những trường posts.ts dùng. */
function post(id: string, data: Partial<Data> = {}): Post {
  return {
    id,
    collection: 'posts',
    body: '',
    data: {
      title: id,
      description: `Mô tả ${id}`,
      pubDate: new Date('2026-01-01T00:00:00Z'),
      category: 'ai',
      tags: [],
      draft: false,
      featured: false,
      comments: true,
      ...data,
    },
  } as unknown as Post;
}

const ids = (posts: Post[]) => posts.map((p) => p.id);
const day = (d: number) => new Date(Date.UTC(2026, 0, d));

describe('relatedPosts', () => {
  it('mỗi thẻ chung +3, cùng chuyên mục +2, cùng series +1 — xếp theo điểm', () => {
    const current = post('current', { tags: ['AI', 'Prompt'], category: 'ai', series: 'Nhập môn' });
    const all = [
      current,
      post('one-tag', { tags: ['AI'], category: 'doi-song' }), // 3
      post('two-tags', { tags: ['AI', 'Prompt'], category: 'doi-song' }), // 6
      post('cat-series', { tags: [], category: 'ai', series: 'Nhập môn' }), // 2 + 1 = 3 (cũ hơn)
      post('cat-only', { tags: [], category: 'ai' }), // 2
      post('nothing', { tags: ['Khác'], category: 'cong-nghe' }), // 0 → loại
    ];
    // "cat-series" và "one-tag" cùng 3 điểm: bài mới hơn đứng trước.
    all[1].data.pubDate = day(10);
    all[3].data.pubDate = day(5);

    expect(ids(relatedPosts(current, all, 10))).toEqual(['two-tags', 'one-tag', 'cat-series', 'cat-only']);
  });

  it('không bao giờ gợi ý chính bài đang đọc và bỏ bài 0 điểm', () => {
    const current = post('current', { tags: ['X'], category: 'ai' });
    const result = relatedPosts(current, [current, post('other', { category: 'cong-nghe' })]);
    expect(result).toEqual([]);
  });

  it('so khớp thẻ không phân biệt hoa/thường và dấu (theo slug)', () => {
    const current = post('current', { tags: ['Năng suất'], category: 'doi-song' });
    const match = post('match', { tags: ['nang suat'], category: 'ai' });
    expect(ids(relatedPosts(current, [current, match]))).toEqual(['match']);
  });

  it('không cộng điểm series khi cả hai bài đều không thuộc series nào', () => {
    const current = post('current', { category: 'ai' });
    const older = post('older', { category: 'ai', pubDate: day(1) });
    const newer = post('newer', { category: 'ai', pubDate: day(2) });
    // 0 điểm. Nếu "undefined === undefined" bị tính là cùng series, bài này được 1 điểm và lọt vào kết quả.
    const unrelated = post('unrelated', { category: 'cong-nghe' });
    expect(ids(relatedPosts(current, [current, older, newer, unrelated]))).toEqual(['newer', 'older']);
  });

  it('mặc định trả tối đa 3 bài, giới hạn tuỳ chỉnh được', () => {
    const current = post('current', { category: 'ai' });
    const many = Array.from({ length: 6 }, (_, i) => post(`p${i}`, { category: 'ai', pubDate: day(i + 1) }));
    expect(ids(relatedPosts(current, [current, ...many]))).toEqual(['p5', 'p4', 'p3']);
    expect(relatedPosts(current, many, 5)).toHaveLength(5);
  });
});

describe('seriesPosts', () => {
  it('chỉ lấy bài cùng series, xếp theo seriesOrder rồi theo ngày đăng', () => {
    const all = [
      post('ep3', { series: 'S', seriesOrder: 3, pubDate: day(1) }),
      post('ep1', { series: 'S', seriesOrder: 1, pubDate: day(9) }),
      post('ep2', { series: 'S', seriesOrder: 2, pubDate: day(5) }),
      post('other', { series: 'Khác', seriesOrder: 1 }),
      post('none'),
    ];
    expect(ids(seriesPosts('S', all))).toEqual(['ep1', 'ep2', 'ep3']);
  });

  it('bài không có seriesOrder xếp sau, giữa chúng theo ngày cũ → mới', () => {
    const all = [
      post('late-b', { series: 'S', pubDate: day(20) }),
      post('ordered', { series: 'S', seriesOrder: 1, pubDate: day(30) }),
      post('late-a', { series: 'S', pubDate: day(10) }),
    ];
    expect(ids(seriesPosts('S', all))).toEqual(['ordered', 'late-a', 'late-b']);
  });

  it('cùng seriesOrder thì bài đăng trước đứng trước', () => {
    const all = [
      post('b', { series: 'S', seriesOrder: 2, pubDate: day(3) }),
      post('a', { series: 'S', seriesOrder: 2, pubDate: day(2) }),
    ];
    expect(ids(seriesPosts('S', all))).toEqual(['a', 'b']);
  });

  it('phân biệt chính xác tên series', () => {
    expect(seriesPosts('s', [post('x', { series: 'S' })])).toEqual([]);
  });
});

describe('isPublished (bản production)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ẩn bản nháp và bài hẹn giờ trong tương lai', () => {
    vi.stubEnv('DEV', false);
    const now = new Date('2026-11-09T01:00:00Z');
    expect(isPublished(post('ok', { pubDate: new Date('2026-11-09T00:59:59Z') }), now)).toBe(true);
    expect(isPublished(post('exact', { pubDate: now }), now)).toBe(true);
    expect(isPublished(post('draft', { draft: true, pubDate: day(1) }), now)).toBe(false);
    expect(isPublished(post('scheduled', { pubDate: new Date('2026-11-09T01:00:01Z') }), now)).toBe(false);
  });

  it('hiện mọi bài khi chạy dev (để xem trước bản nháp)', () => {
    vi.stubEnv('DEV', true);
    expect(isPublished(post('draft', { draft: true, pubDate: new Date('2999-01-01') }))).toBe(true);
  });
});

describe('getTags / getSeries (qua getCollection giả lập)', () => {
  afterEach(() => vi.unstubAllEnvs());

  function mockCollection(posts: Post[]) {
    vi.mocked(getCollection).mockImplementation((async (_name: string, filter?: (p: Post) => boolean) =>
      filter ? posts.filter(filter) : posts) as unknown as typeof getCollection);
  }

  it('đếm thẻ gộp theo slug, nhiều nhất trước rồi theo ABC tiếng Việt', async () => {
    vi.stubEnv('DEV', true); // dev: không dùng cache giữa các test
    mockCollection([
      post('a', { tags: ['AI', 'Đọc sách'] }),
      post('b', { tags: ['ai', 'Bảo mật'] }),
      post('c', { tags: ['Doc sach'] }),
    ]);
    expect(await getTags()).toEqual([
      { name: 'AI', slug: 'ai', count: 2 },
      { name: 'Đọc sách', slug: 'doc-sach', count: 2 },
      { name: 'Bảo mật', slug: 'bao-mat', count: 1 },
    ]);
  });

  it('nhóm series với slug và thứ tự bài', async () => {
    vi.stubEnv('DEV', true);
    mockCollection([
      post('p2', { series: 'Nhập môn AI', seriesOrder: 2 }),
      post('p1', { series: 'Nhập môn AI', seriesOrder: 1 }),
      post('solo'),
    ]);
    const series = await getSeries();
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ name: 'Nhập môn AI', slug: 'nhap-mon-ai' });
    expect(ids(series[0].posts)).toEqual(['p1', 'p2']);
  });
});
