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
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>vi</language><atom:link href="${new URL('rss.xml', context.site)}" rel="self" type="application/rss+xml"/>`,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: postUrl(p),
      categories: [getCategory(p.data.category).name, ...p.data.tags],
    })),
  });
};
