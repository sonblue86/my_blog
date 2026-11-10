import { describe, expect, it } from 'vitest';
import { GitHub, GitHubError, base64ToBytes, bytesToBase64 } from '../../src/studio/github';
import {
  emptyMeta,
  isValidSlug,
  normalizeRel,
  parsePostFile,
  postPath,
  postsFromTree,
  relativeImageRefs,
  serializePostFile,
  validatePost,
  type PostMeta,
} from '../../src/studio/post-file';
import { fitWidth, imageFileName, isSupportedImage, mimeFromName } from '../../src/studio/images';

describe('base64 helpers', () => {
  it('round-trips UTF-8 and binary data', () => {
    const text = 'Tiếng Việt có dấu — đủ cả: ắ ề ỗ ữ 🚀';
    const bytes = new TextEncoder().encode(text);
    expect(new TextDecoder().decode(base64ToBytes(bytesToBase64(bytes)))).toBe(text);
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });
  it('accepts the line-wrapped base64 GitHub returns', () => {
    expect(new TextDecoder().decode(base64ToBytes('eGlu\nIGNoYW8=\n'))).toBe('xin chao');
  });
});

describe('post file', () => {
  const sample = `---
title: 'RAG là gì? Cách cho AI "đọc" tài liệu'
description: 'Mô tả: có dấu hai chấm và ''nháy đơn''.'
pubDate: 2026-10-20
category: cong-nghe
tags: ['RAG', 'LLM']
series: 'AI cho người mới'
seriesOrder: 3
featured: true
summary: 'Tóm tắt nhanh.'
takeaways:
  - 'Ý một.'
  - 'Ý hai.'
slug: 'tuy-chinh'
---

Đoạn mở đầu.

## Tiêu đề

Nội dung.
`;

  it('parses frontmatter and body', () => {
    const { meta, body, extra } = parsePostFile(sample);
    expect(meta.title).toBe('RAG là gì? Cách cho AI "đọc" tài liệu');
    expect(meta.description).toBe("Mô tả: có dấu hai chấm và 'nháy đơn'.");
    expect(meta.pubDate).toBe('2026-10-20');
    expect(meta.category).toBe('cong-nghe');
    expect(meta.tags).toEqual(['RAG', 'LLM']);
    expect(meta.seriesOrder).toBe(3);
    expect(meta.featured).toBe(true);
    expect(meta.draft).toBe(false);
    expect(meta.comments).toBe(true);
    expect(meta.takeaways).toEqual(['Ý một.', 'Ý hai.']);
    expect(extra).toEqual({ slug: 'tuy-chinh' });
    expect(body.startsWith('Đoạn mở đầu.')).toBe(true);
    expect(body.endsWith('Nội dung.')).toBe(true);
  });

  it('round-trips without losing anything', () => {
    const first = parsePostFile(sample);
    const second = parsePostFile(serializePostFile(first));
    expect(second).toEqual(first);
    // Stable: serialising twice gives the same text.
    expect(serializePostFile(second)).toBe(serializePostFile(first));
  });

  it('omits defaults and keeps tricky strings as strings', () => {
    const meta: PostMeta = { ...emptyMeta(new Date('2026-11-10T03:00:00Z')), title: 'yes: #1 "nhất"', description: "It's ok", draft: false };
    const text = serializePostFile({ meta, body: 'Xin chào', extra: {} });
    expect(text).not.toMatch(/draft|featured|comments|tags|cover/);
    expect(text).toContain("title: 'yes: #1 \"nhất\"'");
    const back = parsePostFile(text).meta;
    expect(back.title).toBe('yes: #1 "nhất"');
    expect(back.description).toBe("It's ok");
    expect(back.pubDate).toBe('2026-11-10');
  });

  it('writes draft and disabled comments explicitly', () => {
    const text = serializePostFile({ meta: { ...emptyMeta(), title: 'a', description: 'b', comments: false }, body: 'x', extra: {} });
    expect(text).toContain('draft: true');
    expect(text).toContain('comments: false');
  });

  it('keeps full timestamps and handles files without frontmatter', () => {
    const p = parsePostFile("---\ntitle: 'a'\ndescription: 'b'\npubDate: 2026-11-10T08:30:00+07:00\ncategory: ai\n---\nx\n");
    expect(Date.parse(p.meta.pubDate)).toBe(Date.parse('2026-11-10T01:30:00Z'));
    const bare = parsePostFile('Chỉ có nội dung');
    expect(bare.body).toBe('Chỉ có nội dung');
    expect(bare.meta.title).toBe('');
  });

  it('validates what would break the build', () => {
    const ok: PostMeta = { ...emptyMeta(), title: 'Tiêu đề', description: 'Mô tả' };
    expect(validatePost(ok, 'Nội dung đủ dài để đăng bài.', { publishing: true })).toEqual([]);
    const bad = validatePost({ ...ok, title: ' ', description: 'x'.repeat(301), pubDate: 'hôm nay' }, '', { publishing: true });
    expect(bad.map((e) => e.field).sort()).toEqual(['body', 'description', 'pubDate', 'title']);
    // A draft may have an empty body.
    expect(validatePost(ok, '', { publishing: false })).toEqual([]);
  });

  it('checks slugs and builds the post path', () => {
    expect(isValidSlug('rag-la-gi')).toBe(true);
    expect(isValidSlug('RAG')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('a'.repeat(81))).toBe(false);
    expect(postPath('rag-la-gi')).toBe('src/content/posts/rag-la-gi/index.md');
  });

  it('groups the repo tree into posts with their assets', () => {
    const posts = postsFromTree([
      { path: 'src/content/posts/a/index.md', sha: '1' },
      { path: 'src/content/posts/a/cover.webp', sha: '2' },
      { path: 'src/content/posts/a/img/so-do.png', sha: '3' },
      { path: 'src/content/posts/b/index.mdx', sha: '4' },
      { path: 'src/content/posts/c.md', sha: '5' },
      { path: 'src/content/posts/_nhap/index.md', sha: '6' },
      { path: 'src/content/authors/x.json', sha: '7' },
    ]);
    expect(posts.map((p) => [p.slug, p.format, p.dir])).toEqual([
      ['a', 'md', 'src/content/posts/a'],
      ['b', 'mdx', 'src/content/posts/b'],
      ['c', 'md', ''],
    ]);
    expect(posts[0]!.assets).toEqual({ 'cover.webp': '2', 'img/so-do.png': '3' });
  });

  it('finds relative image references only', () => {
    const body = '![a](./a.png) ![b](img/b%20c.jpg "tiêu đề") ![c](https://x.dev/c.png) ![d](/images/d.png) [link](./not-image.md)';
    expect(relativeImageRefs(body)).toEqual(['a.png', 'img/b c.jpg']);
    expect(normalizeRel('./a%20b.png')).toBe('a b.png');
  });
});

describe('images', () => {
  it('names files safely and avoids clashes', () => {
    expect(imageFileName('Ảnh chụp màn hình (2).PNG', 'webp', [])).toBe('anh-chup-man-hinh-2.webp');
    expect(imageFileName('cover.jpg', 'webp', ['cover.webp', 'COVER-2.webp'])).toBe('cover-3.webp');
    expect(imageFileName('.png', 'png', [])).toBe('anh.png');
  });
  it('scales down keeping the ratio', () => {
    expect(fitWidth(3200, 1800)).toEqual({ width: 1600, height: 900 });
    expect(fitWidth(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('knows which types are images', () => {
    expect(isSupportedImage('image/webp')).toBe(true);
    expect(isSupportedImage('image/svg+xml')).toBe(true);
    expect(isSupportedImage('text/html')).toBe(false);
    expect(mimeFromName('a.JPEG')).toBe('image/jpeg');
    expect(mimeFromName('a.svg')).toBe('image/svg+xml');
  });
});

/** Fake api.github.com: records calls, answers from a tiny in-memory repo. */
function fakeGitHub(opts: { failRefOnce?: boolean } = {}) {
  const calls: { method: string; path: string; body?: any }[] = [];
  let head = 'c1';
  let failRef = opts.failRefOnce ?? false;
  let n = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('https://api.github.com', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
    if (path === '/repos/o/r') return ok({ permissions: { push: true }, private: false });
    if (path === '/repos/o/r/git/ref/heads/main') return ok({ object: { sha: head } });
    if (path.startsWith('/repos/o/r/git/commits/')) return ok({ tree: { sha: `t-${head}` } });
    if (path === '/repos/o/r/git/blobs') return ok({ sha: `blob${++n}` });
    if (path === '/repos/o/r/git/trees') return ok({ sha: `tree${++n}` });
    if (path === '/repos/o/r/git/commits') return ok({ sha: `commit${++n}` });
    if (path === '/repos/o/r/git/refs/heads/main') {
      if (failRef) {
        failRef = false;
        head = 'c2'; // someone else pushed
        return new Response(JSON.stringify({ message: 'Update is not a fast forward' }), { status: 422 });
      }
      head = body.sha;
      return ok({});
    }
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  }) as typeof fetch;
  return { calls, fetcher };
}

describe('GitHub client', () => {
  it('verifies push permission', async () => {
    const { fetcher } = fakeGitHub();
    expect(await new GitHub('tok', { repo: 'o/r', branch: 'main' }, fetcher).verify()).toEqual({ canPush: true, isPrivate: false });
  });

  it('writes text + binary files and deletions in one commit', async () => {
    const { calls, fetcher } = fakeGitHub();
    const gh = new GitHub('tok', { repo: 'o/r', branch: 'main' }, fetcher);
    const res = await gh.commit('Thêm bài', [
      { path: 'src/content/posts/a/index.md', content: '# Xin chào' },
      { path: 'src/content/posts/a/x.webp', content: new Uint8Array([1, 2, 3]) },
    ], ['src/content/posts/a/old.png']);
    const tree = calls.find((c) => c.method === 'POST' && c.path.endsWith('/git/trees'))!;
    expect(tree.body.base_tree).toBe('t-c1');
    expect(tree.body.tree).toEqual([
      { path: 'src/content/posts/a/index.md', mode: '100644', type: 'blob', content: '# Xin chào' },
      { path: 'src/content/posts/a/x.webp', mode: '100644', type: 'blob', sha: 'blob1' },
      { path: 'src/content/posts/a/old.png', mode: '100644', type: 'blob', sha: null },
    ]);
    const commit = calls.find((c) => c.method === 'POST' && c.path.endsWith('/git/commits'))!;
    expect(commit.body).toMatchObject({ message: 'Thêm bài', parents: ['c1'] });
    const ref = calls.find((c) => c.method === 'PATCH')!;
    expect(ref.body).toEqual({ sha: res.sha, force: false });
    expect(calls.filter((c) => c.path.endsWith('/git/blobs')).length).toBe(1);
  });

  it('rebuilds the commit on the new head when the branch moved', async () => {
    const { calls, fetcher } = fakeGitHub({ failRefOnce: true });
    const gh = new GitHub('tok', { repo: 'o/r', branch: 'main' }, fetcher);
    await gh.commit('Cập nhật', [{ path: 'a.md', content: 'x' }]);
    const commits = calls.filter((c) => c.method === 'POST' && c.path.endsWith('/git/commits'));
    expect(commits.map((c) => c.body.parents[0])).toEqual(['c1', 'c2']);
  });

  it('explains failures in Vietnamese', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as typeof fetch;
    const err = await new GitHub('tok', { repo: 'o/r', branch: 'main' }, fetcher).verify().catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/Token không hợp lệ/);
  });
});
