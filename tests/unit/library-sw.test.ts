/**
 * Pure helpers of public/sw.js, loaded in a sandbox (the file is a classic worker script, not a module).
 * Lifecycle / fetch routing are verified in a real browser against a production build.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

type SW = {
  isBlocked(p: string): boolean;
  localPath(u: unknown): string | null;
  pagePath(u: unknown): string | null;
  pickImage(tag: string): string | null;
  extractAssets(html: string, opts?: { images?: boolean }): string[];
};

function loadSW(): SW {
  const code = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const ctx: Record<string, unknown> = {
    self: { location: { origin: 'https://nhipso.test' }, addEventListener() {}, registration: {} },
    URL,
    Headers,
    Response,
    Request,
    caches: {},
    setTimeout,
    clearTimeout,
  };
  runInNewContext(code, ctx);
  return ctx as unknown as SW;
}

const sw = loadSW();

describe('sw.js — paths', () => {
  it('never handles API, admin, Cloudflare or the worker itself', () => {
    for (const p of ['/api/views', '/api', '/admin/', '/admin', '/cdn-cgi/x', '/sw.js']) expect(sw.isBlocked(p)).toBe(true);
    for (const p of ['/', '/bai-viet/x/', '/apiary/', '/administrator-guide/']) expect(sw.isBlocked(p)).toBe(false);
  });

  it('keeps only same-origin pathnames (query and hash dropped)', () => {
    expect(sw.localPath('/bai-viet/a/?utm=x#h')).toBe('/bai-viet/a/');
    expect(sw.localPath('https://nhipso.test/covers/a.svg')).toBe('/covers/a.svg');
    expect(sw.localPath('https://evil.example/bai-viet/a/')).toBeNull();
    expect(sw.localPath('/api/reactions')).toBeNull();
    expect(sw.localPath(42)).toBeNull();
    expect(sw.localPath('')).toBeNull();
  });

  it('normalises pages to the trailing-slash form, leaves files alone', () => {
    expect(sw.pagePath('/bai-viet/a')).toBe('/bai-viet/a/');
    expect(sw.pagePath('/bai-viet/a/?q=1')).toBe('/bai-viet/a/');
    expect(sw.pagePath('/rss.xml')).toBe('/rss.xml');
    expect(sw.pagePath('/')).toBe('/');
  });
});

describe('sw.js — assets a page needs offline', () => {
  const html = `
    <link rel="stylesheet" href="/_astro/BaseLayout.abc.css">
    <link rel=stylesheet href=/_astro/Post.def.css>
    <link rel="icon" href="/favicon.svg">
    <link rel="preload" as="font" href="/_astro/inter.woff2">
    <script type="module" src="/_astro/page.123.js"></script>
    <script src="https://cdn.example/x.js"></script>
    <article class="post">
      <img src="/_astro/cover.CwIGe1jW_big.webp" srcset="/_astro/cover.CwIGe1jW_s.webp 400w, /_astro/cover.CwIGe1jW_l.webp 960w, /_astro/cover.CwIGe1jW_m.webp 640w" alt="">
      <img src="/_astro/diagram.Df2Biusx.svg" alt="Sơ đồ">
      <img src="/covers/a.svg?v=2&amp;x=1" alt="">
      <img data-src="/_astro/lazy.js" alt="">
      <article class="post-card group"><img src="/covers/other-post.svg" alt=""></article>
    </article>`;

  it('takes stylesheets, module scripts and the largest srcset candidate; skips other posts’ thumbnails', () => {
    expect(sw.extractAssets(html).sort()).toEqual(
      [
        '/_astro/BaseLayout.abc.css',
        '/_astro/Post.def.css',
        '/_astro/page.123.js',
        '/_astro/cover.CwIGe1jW_l.webp',
        '/_astro/diagram.Df2Biusx.svg',
        '/covers/a.svg',
      ].sort(),
    );
  });

  it('can skip images (shell precache)', () => {
    expect(sw.extractAssets(html, { images: false }).sort()).toEqual(['/_astro/BaseLayout.abc.css', '/_astro/Post.def.css', '/_astro/page.123.js'].sort());
  });

  it('pickImage falls back to src without srcset', () => {
    expect(sw.pickImage('<img alt="" src="/covers/x.svg">')).toBe('/covers/x.svg');
    expect(sw.pickImage('<img alt="">')).toBeNull();
  });
});
