/**
 * Social share image for every published post: /og/<id>.jpg (1200×630).
 * Referenced by PostLayout (og:image, twitter:image, JSON-LD). Design + rendering live in src/lib/og.ts.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getPosts, getReadingTime, type Post } from '../../lib/posts';
import { coverSvg } from '../../lib/cover';
import { formatDate } from '../../lib/date';
import { OG_COLORS, renderOgImage, type OgArt } from '../../lib/og';
import { SITE, getCategory } from '../../config';

export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

/** The post's own cover file if it has one, otherwise the same generated art as /covers/<id>.svg. */
function artFor(post: Post): OgArt {
  // astro:assets attaches the source path as a non-enumerable `fsPath` on image metadata.
  const file = (post.data.cover as { fsPath?: string } | undefined)?.fsPath;
  return file ? { file } : { svg: coverSvg({ seed: post.id, category: post.data.category }) };
}

export const GET: APIRoute = async ({ props, site }) => {
  const post = props.post as Post;
  const category = getCategory(post.data.category);
  const img = await renderOgImage({
    title: post.data.title,
    chips: [{ label: category.name, color: OG_COLORS.category[category.id] ?? OG_COLORS.fg }],
    meta: [`${getReadingTime(post).minutes} phút đọc`, formatDate(post.data.pubDate)],
    host: (site ?? new URL(SITE.url)).host,
    siteName: SITE.title,
    art: artFor(post),
  });
  return new Response(new Uint8Array(img), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' },
  });
};
