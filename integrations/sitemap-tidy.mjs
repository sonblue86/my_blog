// @ts-check
/**
 * Post-build tidy-up for @astrojs/sitemap (must be listed AFTER sitemap() in astro.config.mjs):
 *  - drops every URL whose built HTML says <meta name="robots" content="noindex…"> — so the sitemap can never
 *    drift from the pages' own robots tags (thin tag pages, /ngau-nhien/, /offline/, …);
 *  - adds <lastmod> from article:modified_time / article:published_time when the page has one.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** @returns {import('astro').AstroIntegration} */
export default function sitemapTidy() {
  return {
    name: 'sitemap-tidy',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root)).filter((f) => /^sitemap-\d+\.xml$/.test(f));
        let dropped = 0;
        let dated = 0;
        for (const file of files) {
          const path = join(root, file);
          const xml = await readFile(path, 'utf8');
          const urls = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
          const kept = [];
          for (const block of urls) {
            const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
            if (!loc) continue;
            const pathname = decodeURIComponent(new URL(loc).pathname);
            let html = '';
            try {
              html = await readFile(join(root, pathname, pathname.endsWith('/') ? 'index.html' : ''), 'utf8');
            } catch {
              kept.push(block); // not an HTML page we built (e.g. an endpoint) — leave it alone
              continue;
            }
            if (/<meta name="robots" content="noindex/i.test(html)) {
              dropped++;
              continue;
            }
            const date =
              html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1] ??
              html.match(/<meta property="article:published_time" content="([^"]+)"/)?.[1];
            if (date && !block.includes('<lastmod>')) {
              dated++;
              kept.push(block.replace('</loc>', `</loc><lastmod>${date}</lastmod>`));
            } else kept.push(block);
          }
          const head = xml.slice(0, xml.indexOf('<url>') === -1 ? xml.indexOf('</urlset>') : xml.indexOf('<url>'));
          await writeFile(path, `${head}${kept.join('')}</urlset>`);
        }
        logger.info(`removed ${dropped} noindex URL(s), added lastmod to ${dated}`);
      },
    },
  };
}
