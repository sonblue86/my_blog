/**
 * Site-wide default share image: /og/index.png (1200×630) — used by every page without its own
 * (see `image` default in src/components/layout/Head.astro).
 */
import type { APIRoute } from 'astro';
import { coverSvg } from '../../lib/cover';
import { OG_COLORS, renderOgImage } from '../../lib/og';
import { CATEGORIES, SITE } from '../../config';

export const GET: APIRoute = async ({ site }) => {
  const png = await renderOgImage({
    title: 'AI, công nghệ & đời sống số',
    subtitle: 'Blog tiếng Việt — viết chậm, đọc sâu.',
    chips: CATEGORIES.map((c) => ({ label: c.name, color: OG_COLORS.category[c.id] ?? OG_COLORS.fg })),
    host: (site ?? new URL(SITE.url)).host,
    siteName: SITE.title,
    art: { svg: coverSvg({ seed: 'nhip-so', category: 'ai' }) },
  });
  return new Response(new Uint8Array(png), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
};
