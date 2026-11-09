/**
 * Build-time helpers for querying posts. Everything here runs in Astro (server/build) context.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { slugify, readingTime } from './text';

export type Post = CollectionEntry<'posts'>;

/** Drafts are visible in `astro dev`, hidden in production builds. Scheduled (future) posts too. */
export function isPublished(post: Post, now = new Date()): boolean {
  if (import.meta.env.DEV) return true;
  return !post.data.draft && post.data.pubDate.getTime() <= now.getTime();
}

let cache: Post[] | undefined;

/** All published posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  if (cache && !import.meta.env.DEV) return cache;
  const posts = (await getCollection('posts', (p) => isPublished(p))).sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );
  cache = posts;
  return posts;
}

export function postUrl(post: Post | string): string {
  const id = typeof post === 'string' ? post : post.id;
  return `/bai-viet/${id}/`;
}

export function tagSlug(tag: string): string {
  return slugify(tag);
}

export function tagUrl(tag: string): string {
  return `/the/${tagSlug(tag)}/`;
}

export function categoryUrl(id: string): string {
  return `/chuyen-muc/${id}/`;
}

export function seriesUrl(series: string): string {
  return `/series/${slugify(series)}/`;
}

export function getReadingTime(post: Post) {
  return readingTime(post.body ?? '');
}

export interface TagInfo {
  name: string;
  slug: string;
  count: number;
}

/** Tags with counts, most used first. Tags are matched case/diacritic-insensitively by slug. */
export async function getTags(): Promise<TagInfo[]> {
  const map = new Map<string, TagInfo>();
  for (const post of await getPosts()) {
    for (const name of post.data.tags) {
      const slug = tagSlug(name);
      const info = map.get(slug) ?? { name, slug, count: 0 };
      info.count++;
      map.set(slug, info);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}

/**
 * Related posts: shared tags weigh most, same category and same series add a little,
 * newer posts break ties.
 */
export function relatedPosts(post: Post, all: Post[], limit = 3): Post[] {
  const tags = new Set(post.data.tags.map(tagSlug));
  return all
    .filter((p) => p.id !== post.id)
    .map((p) => {
      let score = 0;
      for (const t of p.data.tags) if (tags.has(tagSlug(t))) score += 3;
      if (p.data.category === post.data.category) score += 2;
      if (post.data.series && p.data.series === post.data.series) score += 1;
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.p.data.pubDate.getTime() - a.p.data.pubDate.getTime())
    .slice(0, limit)
    .map(({ p }) => p);
}

/** Posts in the same series, ordered by seriesOrder then date. */
export function seriesPosts(series: string, all: Post[]): Post[] {
  return all
    .filter((p) => p.data.series === series)
    .sort(
      (a, b) =>
        (a.data.seriesOrder ?? 999) - (b.data.seriesOrder ?? 999) ||
        a.data.pubDate.getTime() - b.data.pubDate.getTime(),
    );
}

export async function getSeries(): Promise<{ name: string; slug: string; posts: Post[] }[]> {
  const all = await getPosts();
  const names = [...new Set(all.map((p) => p.data.series).filter((s): s is string => !!s))];
  return names.map((name) => ({ name, slug: slugify(name), posts: seriesPosts(name, all) }));
}
