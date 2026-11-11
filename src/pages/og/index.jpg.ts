/**
 * Site-wide default share image: /og/index.jpg (1200×630) — used by every page without its own
 * (see `image` default in src/components/layout/Head.astro).
 */
import type { APIRoute } from 'astro';
import { coverSvg } from '../../lib/cover';
import { OG_COLORS, renderOgImage } from '../../lib/og';
import { CATEGORIES, SITE } from '../../config';

export const GET: APIRoute = async ({ site }) => {
  const img = await renderOgImage({
    // No-break spaces keep "hỏi cho ra lẽ" on one line → "Thắc mắc gì, / hỏi cho ra lẽ."
    title: 'Thắc mắc gì, hỏi cho ra lẽ.',
    subtitle: 'Blog tiếng Việt giải đáp dễ hiểu, có kiểm chứng.',
    chips: CATEGORIES.map((c) => ({ label: c.name, color: OG_COLORS.category[c.id] ?? OG_COLORS.fg })),
    host: (site ?? new URL(SITE.url)).host,
    siteName: SITE.title,
    art: { svg: coverSvg({ seed: 'nhip-so', category: 'ai' }) },
  });
  return new Response(new Uint8Array(img), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' },
  });
};
