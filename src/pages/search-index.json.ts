/** Lightweight index for instant, accent-insensitive title/tag search (Pagefind adds full-text on top). */
import type { APIRoute } from 'astro';
import { getPosts, postUrl, getReadingTime } from '../lib/posts';
import { fold } from '../lib/text';

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const items = posts.map((p) => ({
    id: p.id,
    url: postUrl(p),
    title: p.data.title,
    description: p.data.description,
    category: p.data.category,
    tags: p.data.tags,
    date: p.data.pubDate.toISOString(),
    minutes: getReadingTime(p).minutes,
    cover: typeof p.data.cover === 'object' ? p.data.cover.src : `/covers/${p.id}.svg`,
    hay: fold([p.data.title, p.data.description, p.data.tags.join(' '), p.data.series ?? ''].join(' ')),
  }));
  return new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
