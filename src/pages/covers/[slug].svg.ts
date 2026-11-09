/** Generated cover art for posts without a cover image: /covers/<slug>.svg (built once, cached forever). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getPosts } from '../../lib/posts';
import { coverSvg } from '../../lib/cover';

export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { category: post.data.category },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params, props }) =>
  new Response(coverSvg({ seed: String(params.slug), category: String(props.category) }), {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8' },
  });
