/**
 * Read and write a post file (YAML frontmatter + Markdown body) for the writing studio.
 * The fields mirror the zod schema in src/content.config.ts — keep the two in sync, otherwise the
 * build fails with "data does not match collection schema".
 */
import { parse as parseYaml } from 'yaml';
import { CATEGORIES, POSTS_DIR, SLUG_MAX_LENGTH, parseTags, slugify, todayIn, yamlString } from '../../scripts/lib/new-post-core.mjs';

export { CATEGORIES, POSTS_DIR, SLUG_MAX_LENGTH, parseTags, slugify, todayIn };

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface PostMeta {
  title: string;
  description: string;
  /** "YYYY-MM-DD" or a full ISO timestamp. */
  pubDate: string;
  updatedDate?: string;
  category: CategoryId;
  tags: string[];
  /** Relative path of the cover image inside the post folder, e.g. "./cover.webp". */
  cover?: string;
  coverAlt?: string;
  author?: string;
  summary?: string;
  takeaways?: string[];
  series?: string;
  seriesOrder?: number;
  featured: boolean;
  draft: boolean;
  comments: boolean;
}

export interface PostFile {
  meta: PostMeta;
  body: string;
  /** Frontmatter keys this editor does not know — written back untouched. */
  extra: Record<string, unknown>;
}

const KNOWN = new Set<string>([
  'title', 'description', 'pubDate', 'updatedDate', 'category', 'tags', 'cover', 'coverAlt', 'author',
  'summary', 'takeaways', 'series', 'seriesOrder', 'featured', 'draft', 'comments',
]);

export function emptyMeta(now = new Date()): PostMeta {
  return { title: '', description: '', pubDate: todayIn(now), category: 'ai', tags: [], featured: false, draft: true, comments: true };
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** YAML dates come back as Date objects or strings — normalise to what we write. */
function dateStr(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  return str(v);
}

const FM_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parsePostFile(text: string): PostFile {
  const m = FM_RE.exec(text);
  const raw = m ? (parseYaml(m[1] ?? '') as unknown) : {};
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const body = (m ? text.slice(m[0].length) : text).replace(/^\s*\n/, '').replace(/\s+$/, '');
  const category = CATEGORIES.some((c) => c.id === data.category) ? (data.category as CategoryId) : 'ai';
  const order = Number(data.seriesOrder);
  const takeaways = strList(data.takeaways);

  const meta: PostMeta = {
    title: str(data.title),
    description: str(data.description),
    pubDate: dateStr(data.pubDate) || todayIn(),
    updatedDate: dateStr(data.updatedDate) || undefined,
    category,
    tags: strList(data.tags),
    cover: str(data.cover) || undefined,
    coverAlt: str(data.coverAlt) || undefined,
    author: str(data.author) || undefined,
    summary: str(data.summary) || undefined,
    takeaways: takeaways.length ? takeaways : undefined,
    series: str(data.series) || undefined,
    seriesOrder: Number.isInteger(order) && order > 0 ? order : undefined,
    featured: data.featured === true,
    draft: data.draft === true,
    comments: data.comments !== false,
  };
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!KNOWN.has(k)) extra[k] = v;
  return { meta, body, extra };
}

function yamlExtra(value: unknown): string {
  if (typeof value === 'string') return yamlString(value);
  return JSON.stringify(value); // JSON is valid YAML flow syntax
}

/** Same style as the existing posts: single-quoted strings, defaults omitted. */
export function serializePostFile({ meta, body, extra }: PostFile): string {
  const lines: string[] = [];
  const add = (key: string, value: string) => lines.push(`${key}: ${value}`);
  add('title', yamlString(meta.title));
  add('description', yamlString(meta.description));
  add('pubDate', meta.pubDate);
  if (meta.updatedDate) add('updatedDate', meta.updatedDate);
  add('category', meta.category);
  if (meta.tags.length) add('tags', `[${meta.tags.map(yamlString).join(', ')}]`);
  if (meta.cover) add('cover', yamlString(meta.cover));
  if (meta.coverAlt) add('coverAlt', yamlString(meta.coverAlt));
  if (meta.author) add('author', meta.author);
  if (meta.series) add('series', yamlString(meta.series));
  if (meta.series && meta.seriesOrder) add('seriesOrder', String(meta.seriesOrder));
  if (meta.featured) add('featured', 'true');
  if (meta.draft) add('draft', 'true');
  if (!meta.comments) add('comments', 'false');
  if (meta.summary) add('summary', yamlString(meta.summary));
  if (meta.takeaways?.length) {
    lines.push('takeaways:');
    for (const t of meta.takeaways) lines.push(`  - ${yamlString(t)}`);
  }
  for (const [k, v] of Object.entries(extra)) add(k, yamlExtra(v));
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/\s+$/, '')}\n`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= SLUG_MAX_LENGTH;
}

/** Problems that would break the build or the page, as Vietnamese messages keyed by field. */
export function validatePost(meta: PostMeta, body: string, opts: { publishing: boolean }): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  if (!meta.title.trim()) err('title', 'Bài viết cần có tiêu đề.');
  if (!meta.description.trim()) err('description', 'Cần có mô tả ngắn (hiện trên Google và thẻ bài viết).');
  else if (meta.description.length > 300) err('description', `Mô tả ngắn dài ${meta.description.length} ký tự — tối đa 300.`);
  if (!DATE_RE.test(meta.pubDate) || Number.isNaN(Date.parse(meta.pubDate))) err('pubDate', 'Ngày đăng chưa hợp lệ.');
  if (meta.updatedDate && (!DATE_RE.test(meta.updatedDate) || Number.isNaN(Date.parse(meta.updatedDate)))) {
    err('updatedDate', 'Ngày cập nhật chưa hợp lệ.');
  }
  if (!CATEGORIES.some((c) => c.id === meta.category)) err('category', 'Hãy chọn một chuyên mục.');
  if (meta.seriesOrder !== undefined && (!Number.isInteger(meta.seriesOrder) || meta.seriesOrder < 1)) {
    err('seriesOrder', 'Thứ tự trong series phải là số nguyên từ 1.');
  }
  if (opts.publishing && body.trim().length < 20) err('body', 'Nội dung bài còn trống — hãy viết vài dòng trước khi đăng.');
  return errors;
}

/** Path of a new post: one folder per post so images live next to it. */
export function postPath(slug: string): string {
  return `${POSTS_DIR}/${slug}/index.md`;
}

export interface PostEntry {
  slug: string;
  /** Path of the Markdown file. */
  path: string;
  sha: string;
  /** Folder that holds the post's images ("" for single-file posts). */
  dir: string;
  format: 'md' | 'mdx';
  /** Other files in the post folder (images…), relative name → blob sha. */
  assets: Record<string, string>;
}

/** Group the repo tree under POSTS_DIR into posts (folder posts and single-file posts). */
export function postsFromTree(entries: { path: string; sha: string }[]): PostEntry[] {
  const posts = new Map<string, PostEntry>();
  const prefix = `${POSTS_DIR}/`;
  const rel = entries.filter((e) => e.path.startsWith(prefix)).map((e) => ({ ...e, rel: e.path.slice(prefix.length) }));
  for (const e of rel) {
    const m = /^([^/]+)\/index\.(mdx?)$/.exec(e.rel) ?? /^([^/]+)\.(mdx?)$/.exec(e.rel);
    if (!m || m[1]!.startsWith('_')) continue;
    const folder = e.rel.includes('/');
    posts.set(m[1]!, {
      slug: slugify(m[1]!, 200),
      path: e.path,
      sha: e.sha,
      dir: folder ? `${prefix}${m[1]}` : '',
      format: m[2] as 'md' | 'mdx',
      assets: {},
    });
  }
  for (const e of rel) {
    const slash = e.rel.indexOf('/');
    if (slash < 0) continue;
    const post = posts.get(e.rel.slice(0, slash));
    if (post && post.dir && e.path !== post.path) post.assets[e.rel.slice(slash + 1)] = e.sha;
  }
  return [...posts.values()];
}

/** Relative image references ("./a.png", "a.png", "img/a.png") in a Markdown body. */
export function relativeImageRefs(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) {
    const url = m[1]!;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) continue;
    out.add(normalizeRel(url));
  }
  return [...out];
}

/** "./a b.png" → "a b.png" (decoded, no leading "./"). */
export function normalizeRel(url: string): string {
  let rel = url.replace(/^\.\//, '');
  try {
    rel = decodeURIComponent(rel);
  } catch {
    /* keep as is */
  }
  return rel;
}
