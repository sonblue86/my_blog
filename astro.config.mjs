// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import expressiveCode from 'astro-expressive-code';
import tailwindcss from '@tailwindcss/vite';
import rehypeHeadingIds from './src/lib/rehype-heading-ids.mjs';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import sitemapTidy from './integrations/sitemap-tidy.mjs';
import cspInline from './integrations/csp-inline.mjs';
import { SITE } from './src/config.ts';

export default defineConfig({
  site: process.env.SITE_URL || SITE.url,
  trailingSlash: 'always',
  // Astro 7 defaults to 'jsx' whitespace handling, which eats spaces between inline elements.
  compressHTML: true,
  build: { format: 'directory' },
  // Project-local caches: worktrees can share one node_modules (junction) without clobbering each other.
  cacheDir: './.cache/astro',
  prefetch: { prefetchAll: true, defaultStrategy: 'tap' },
  // Content-Security-Policy as a <meta> on every page: Astro hashes each script/style it emits, so an
  // injected inline <script> never runs. Header-only directives (frame-ancestors) are in public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // Articles may embed images from anywhere (Markdown), YouTube thumbnails included.
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        "media-src 'self'",
        // /api/* is same-origin; cloudflareinsights = optional Web Analytics beacon.
        "connect-src 'self' https://cloudflareinsights.com",
        // Comments (Giscus), newsletter captcha (Turnstile), <YouTube> player.
        "frame-src https://giscus.app https://challenges.cloudflare.com https://www.youtube-nocookie.com",
        "worker-src 'self'",
        "manifest-src 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://giscus.app', 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'],
      },
      styleDirective: {
        resources: [
          { resource: "'self'", kind: 'element' },
          // giscus client.js loads https://giscus.app/default.css for its iframe.
          { resource: 'https://giscus.app', kind: 'element' },
          // style="…" attributes (cover gradients, Expressive Code, CSS variables) cannot be hashed.
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
  integrations: [
    // Expressive Code must come before MDX so code blocks in .mdx are handled too.
    expressiveCode({
      themes: ['github-light', 'github-dark-dimmed'],
      themeCssSelector: (theme) => (theme.type === 'dark' ? "[data-theme='dark']" : "[data-theme='light']"),
      useDarkModeMediaQuery: false,
      styleOverrides: {
        borderRadius: '14px',
        borderColor: 'var(--border)',
        codeFontFamily: 'var(--font-mono)',
        codeFontSize: '0.875rem',
        codeLineHeight: '1.7',
        uiFontFamily: 'var(--font-sans)',
        frames: {
          shadowColor: 'transparent',
          editorActiveTabIndicatorTopColor: 'var(--accent)',
          frameBoxShadowCssValue: 'none',
        },
      },
      defaultProps: { wrap: false },
      frames: { showCopyToClipboardButton: true },
    }),
    mdx(),
    sitemap({
      // Private/utility pages. Anything else marked noindex is dropped by sitemapTidy() after the build.
      filter: (page) => !page.includes('/thu-vien/') && !page.includes('/tim-kiem/') && !page.includes('/admin/'),
    }),
    sitemapTidy(),
    // Adds the hashes of <script is:inline> blocks to each page's CSP (Astro only hashes bundled scripts).
    cspInline(),
  ],
  markdown: {
    processor: unified({
      remarkRehype: {
        footnoteLabel: 'Chú thích',
        footnoteBackLabel: (/** @type {number} */ i) => `Quay lại đoạn tham chiếu ${i + 1}`,
      },
      rehypePlugins: [
        rehypeHeadingIds,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'wrap',
            properties: { className: ['heading-anchor'] },
            test: ['h2', 'h3', 'h4'],
          },
        ],
        [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
      ],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
    cacheDir: './.cache/vite',
    // `npm run dev:api` runs the Cloudflare Worker (views, reactions, newsletter) on :8787.
    server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  },
});
