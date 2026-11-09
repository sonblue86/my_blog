import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE, getCategory } from '../config';
import { getPosts, postUrl } from '../lib/posts';

export const GET: APIRoute = async (context) => {
  const posts = await getPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    customData: `<language>vi</language>`,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: postUrl(p),
      categories: [getCategory(p.data.category).name, ...p.data.tags],
      // Full HTML for .md posts (MDX has no pre-rendered HTML here).
      content: p.rendered?.html || undefined,
    })),
  });
};
