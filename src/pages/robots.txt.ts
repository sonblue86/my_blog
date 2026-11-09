import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) =>
  new Response(
    ['User-agent: *', 'Allow: /', 'Disallow: /admin/', 'Disallow: /api/', 'Disallow: /thu-vien/', 'Disallow: /tim-kiem/', '', `Sitemap: ${new URL('sitemap-index.xml', site)}`, ''].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
