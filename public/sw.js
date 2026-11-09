/* Nhịp Số — service worker
 *
 * Caches (all prefixed "ns-"; anything else with that prefix is deleted on activate):
 *   ns-static-<BUILD>  precache: /offline/, /, icons, manifest (+ the CSS/JS those pages need)
 *   ns-pages-v1        HTML of pages you visited (network-first, capped)
 *   ns-assets-v1       /_astro/* CSS/JS + fonts — content-hashed → cache-first (capped)
 *   ns-images-v1       images — /_astro/* cache-first, /covers/*, /og/*… stale-while-revalidate (capped)
 *   ns-search-v1       Pagefind runtime files (hashed fragments cache-first, entry/js network-first)
 *   ns-saved-v1        articles the reader bookmarked + their CSS/JS/cover — never evicted,
 *                      managed only by messages from the page (cache-post / uncache-post / sync-saved)
 * Never touched: non-GET, other origins, /api/*, /admin/*, /cdn-cgi/*, range requests.
 *
 * BUILD is stamped by the build (see integration notes); if it is left as-is the SW still works,
 * it just won't re-precache until this file changes.
 */
const BUILD = '__BUILD_ID__';
const STATIC = `ns-static-${BUILD}`;
const PAGES = 'ns-pages-v1';
const ASSETS = 'ns-assets-v1';
const IMAGES = 'ns-images-v1';
const SEARCH = 'ns-search-v1';
const SAVED = 'ns-saved-v1';
const KEEP = [STATIC, PAGES, ASSETS, IMAGES, SEARCH, SAVED];
const LIMITS = { [PAGES]: 60, [ASSETS]: 250, [IMAGES]: 80, [SEARCH]: 200 };

const OFFLINE_URL = '/offline/';
const PRECACHE_PAGES = [OFFLINE_URL, '/'];
const PRECACHE_FILES = ['/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
const NAV_TIMEOUT = 3000;
const SHELL_MAX_AGE = 24 * 3600 * 1000;

const ORIGIN = self.location.origin;
const MATCH = { ignoreVary: true };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function isBlocked(path) {
  return (
    path.startsWith('/api/') ||
    path === '/api' ||
    path.startsWith('/admin/') ||
    path === '/admin' ||
    path.startsWith('/cdn-cgi/') ||
    path === '/sw.js'
  );
}

/** Same-origin, non-blocked "path?query" for a URL coming from a message — or null. */
function localPath(input) {
  if (typeof input !== 'string' || !input) return null;
  try {
    const u = new URL(input, ORIGIN);
    if (u.origin !== ORIGIN || isBlocked(u.pathname)) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

const isPage = (url) => new URL(url, ORIGIN).pathname.endsWith('/');
const IMG_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i;
const FONT_EXT = /\.(?:woff2?|ttf|otf)$/i;
const isImage = (req, path) => req.destination === 'image' || IMG_EXT.test(path);
const isFont = (req, path) => req.destination === 'font' || FONT_EXT.test(path);
/** Pagefind files whose names carry a content hash (safe to cache forever). */
const isHashedPagefind = (path) => /^\/pagefind\/(?:fragment|index|filter)\//.test(path) || /\.pf_meta$/.test(path);

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const cacheable = (res) => res && res.ok && res.type === 'basic';

const trimming = new Map();
/** Delete the oldest entries above the cap (Cache Storage keeps insertion order). */
function trim(name) {
  const max = LIMITS[name];
  if (!max) return Promise.resolve();
  if (trimming.has(name)) return trimming.get(name);
  const p = (async () => {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  })()
    .catch(() => {})
    .finally(() => trimming.delete(name));
  trimming.set(name, p);
  return p;
}

async function put(name, key, res) {
  try {
    const cache = await caches.open(name);
    await cache.put(key, res);
    await trim(name);
  } catch {
    /* quota exceeded or storage blocked — caching is best effort */
  }
}

/** HTML stored with our own headers (and never a "redirected" response, which navigations reject). */
function htmlResponse(html, from, extra = {}) {
  const headers = new Headers(from.headers);
  headers.set('X-NS-Cached-At', String(Date.now()));
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(html, { status: 200, statusText: 'OK', headers });
}

const ASSET_RE = /(?:href|src)=["']?(\/(?:_astro|covers)\/[^"'\s>]+)/g;
const JS_IMPORT_RE = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+?\.js)["']/g;

/** CSS/JS/images a page references directly (root-relative /_astro/ and /covers/ URLs). */
function extractAssets(html) {
  const out = new Set();
  for (const m of html.matchAll(ASSET_RE)) out.add(m[1].replace(/&amp;/g, '&'));
  return [...out];
}

/** Get an asset into `cache` (reusing any copy from another cache first). */
async function cacheAsset(cache, path) {
  let res = await cache.match(path, MATCH);
  if (res) return res;
  res = await caches.match(path, MATCH);
  if (!res) {
    res = await fetch(path, { credentials: 'same-origin' });
    if (!cacheable(res)) throw new Error(`HTTP ${res.status} ${path}`);
  }
  await cache.put(path, res.clone());
  return res;
}

/** Cache a page's assets plus the JS chunks its scripts import (so it works fully offline). */
async function cachePageAssets(cache, html) {
  const all = new Set(extractAssets(html));
  const queue = [...all].filter((p) => p.endsWith('.js'));
  await Promise.allSettled([...all].filter((p) => !p.endsWith('.js')).map((p) => cacheAsset(cache, p)));
  while (queue.length) {
    const js = queue.shift();
    try {
      const res = await cacheAsset(cache, js);
      const text = await res.clone().text();
      for (const m of text.matchAll(JS_IMPORT_RE)) {
        const dep = new URL(m[1], ORIGIN + js).pathname;
        if (dep.startsWith('/_astro/') && !all.has(dep)) {
          all.add(dep);
          queue.push(dep);
        }
      }
    } catch {
      /* missing chunk: the page still renders, only that script is lost */
    }
  }
  return [...all];
}

/** Fetch a page fresh and store it (+ its assets) in `cache`. Throws if the page can't be fetched. */
async function cachePage(cache, path, extra = {}) {
  const res = await fetch(new Request(path, { cache: 'no-cache', credentials: 'same-origin' }));
  if (!res.ok || res.type !== 'basic') throw new Error(`HTTP ${res.status} ${path}`);
  return storePageInto(cache, path, res, extra);
}

async function storePageInto(cache, key, res, extra = {}) {
  const html = await res.text();
  const assets = await cachePageAssets(cache, html);
  await cache.put(key, htmlResponse(html, res, { 'X-NS-Assets': assets.join(','), ...extra }));
  return assets;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC);
      await cachePage(cache, OFFLINE_URL); // required: without it there is no offline fallback
      await Promise.allSettled([
        ...PRECACHE_PAGES.filter((p) => p !== OFFLINE_URL).map((p) => cachePage(cache, p)),
        ...PRECACHE_FILES.map((p) => cacheAsset(cache, p)),
      ]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const stale = names.filter((n) => n.startsWith('ns-') && !KEEP.includes(n));
      await Promise.all(stale.map((n) => caches.delete(n)));
      await self.clients.claim();
      // A previous precache existed → this is an update, not the first install.
      if (stale.some((n) => n.startsWith('ns-static-'))) {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const c of clients) c.postMessage({ type: 'updated' });
      }
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* Fetch routing                                                        */
/* ------------------------------------------------------------------ */

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== ORIGIN) return;
  const path = url.pathname;
  if (isBlocked(path) || req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  if (path.startsWith('/pagefind/')) {
    event.respondWith(isHashedPagefind(path) ? cacheFirst(event, SEARCH) : networkFirst(event, SEARCH));
    return;
  }
  if (isImage(req, path)) {
    event.respondWith(path.startsWith('/_astro/') ? cacheFirst(event, IMAGES) : staleWhileRevalidate(event, IMAGES));
    return;
  }
  if (path.startsWith('/_astro/') || isFont(req, path)) {
    event.respondWith(cacheFirst(event, ASSETS));
    return;
  }
  if (path === '/search-index.json') {
    event.respondWith(networkFirst(event, PAGES));
  }
  // Everything else: the browser's normal network behaviour.
});

/** Look a page up in every cache that may hold it; tolerant to a missing trailing slash and query. */
async function matchPage(urlString) {
  const u = new URL(urlString);
  u.hash = '';
  const exact = u.href;
  const slash = u.pathname.endsWith('/') ? null : new URL(u.pathname + '/' + u.search, ORIGIN).href;
  for (const key of [exact, slash]) {
    if (!key) continue;
    for (const cacheName of [PAGES, SAVED, STATIC]) {
      const hit = await caches.match(key, { cacheName, ...MATCH });
      if (hit) return hit;
    }
  }
  if (u.search) {
    for (const cacheName of [PAGES, SAVED, STATIC]) {
      const hit = await caches.match(exact, { cacheName, ignoreSearch: true, ...MATCH });
      if (hit) return hit;
    }
  }
  return undefined;
}

async function offlineFallback() {
  const hit = await caches.match(OFFLINE_URL, { cacheName: STATIC, ...MATCH });
  if (hit) return hit;
  return new Response(
    '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Bạn đang offline · Nhịp Số</title><style>:root{color-scheme:light dark}body{font:17px/1.6 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 20px}</style>' +
      '<h1>Bạn đang offline</h1><p>Không tải được trang này. Kiểm tra kết nối mạng rồi thử lại nhé.</p><p><button onclick="location.reload()">Thử lại</button></p></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

/** Network-first with a ~3 s timeout → cached copy → /offline/. */
async function navigate(event) {
  const req = event.request;
  const network = (async () => {
    const res = await fetch(req);
    if (cacheable(res) && (res.headers.get('content-type') || '').includes('text/html')) {
      const copy = res.clone();
      event.waitUntil(afterNavigation(req.url, copy));
    }
    return res;
  })();
  // Keep the worker alive until the network settles, even if we answered from cache first.
  event.waitUntil(network.catch(() => {}));

  try {
    return await withTimeout(network, NAV_TIMEOUT);
  } catch {
    const cached = await matchPage(req.url);
    if (cached) return cached;
    try {
      return await network; // slow but alive: keep waiting rather than showing "offline"
    } catch {
      return offlineFallback();
    }
  }
}

/** Store a fresh page; refresh the saved copy if it's a bookmarked article; keep the shell fresh. */
async function afterNavigation(urlString, res) {
  try {
    const u = new URL(urlString);
    u.hash = '';
    const key = u.href;
    const savedCache = await caches.open(SAVED);
    const saved = await savedCache.match(key, MATCH);
    if (saved) {
      const cover = saved.headers.get('X-NS-Cover') || '';
      await storePageInto(savedCache, key, res.clone(), cover ? { 'X-NS-Cover': cover } : {});
      await gcSaved();
    }
    await put(PAGES, key, htmlResponse(await res.text(), res));
    await refreshShell();
  } catch {
    /* best effort */
  }
}

let shellCheckedAt = 0;
/** Re-precache /offline/ (and its CSS/JS) once a day, so it matches the current deploy. */
async function refreshShell() {
  if (Date.now() - shellCheckedAt < 3600 * 1000) return;
  shellCheckedAt = Date.now();
  const cache = await caches.open(STATIC);
  const hit = await cache.match(OFFLINE_URL, MATCH);
  const at = Number(hit && hit.headers.get('X-NS-Cached-At')) || 0;
  if (Date.now() - at > SHELL_MAX_AGE) await cachePage(cache, OFFLINE_URL).catch(() => {});
}

async function cacheFirst(event, name) {
  const req = event.request;
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (cacheable(res)) event.waitUntil(put(name, req, res.clone()));
    return res;
  } catch {
    return name === IMAGES ? imagePlaceholder() : Response.error();
  }
}

async function staleWhileRevalidate(event, name) {
  const req = event.request;
  const hit = await caches.match(req, MATCH);
  const network = fetch(req).then(async (res) => {
    if (cacheable(res)) await put(name, req, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  try {
    return await network;
  } catch {
    return imagePlaceholder();
  }
}

async function networkFirst(event, name) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (cacheable(res)) event.waitUntil(put(name, req, res.clone()));
    return res;
  } catch {
    const hit = await caches.match(req, MATCH);
    return hit || Response.error();
  }
}

/** Neutral picture shown for images that aren't available offline (works on light and dark pages). */
function imagePlaceholder() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">' +
    '<rect width="400" height="250" fill="#8882"/>' +
    '<path d="M150 150l35-40 25 28 18-18 32 30z" fill="#8884"/><circle cx="240" cy="100" r="12" fill="#8884"/></svg>';
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}

/* ------------------------------------------------------------------ */
/* Saved articles (messages from the page)                              */
/* ------------------------------------------------------------------ */

async function savePost(url, cover) {
  const path = localPath(url);
  if (!path) return false;
  const coverPath = localPath(cover) || '';
  const cache = await caches.open(SAVED);
  const extra = coverPath ? { 'X-NS-Cover': coverPath } : {};
  let ok = false;
  try {
    await cachePage(cache, path, extra);
    ok = true;
  } catch {
    // Offline right now? Promote the copy we already have from a recent visit.
    const hit = await matchPage(new URL(path, ORIGIN).href);
    if (hit) {
      await storePageInto(cache, path, hit, extra).catch(() => {});
      ok = true;
    }
  }
  if (ok && coverPath) await cacheAsset(cache, coverPath).catch(() => {});
  return ok;
}

async function unsavePost(url) {
  const path = localPath(url);
  if (!path) return;
  const cache = await caches.open(SAVED);
  await cache.delete(path, { ignoreSearch: false, ...MATCH });
  await gcSaved();
}

/** Drop CSS/JS/covers no longer referenced by any saved article. */
async function gcSaved() {
  const cache = await caches.open(SAVED);
  const keys = await cache.keys();
  const keep = new Set();
  const pages = keys.filter((k) => isPage(k.url));
  for (const k of pages) {
    const res = await cache.match(k, MATCH);
    if (!res) continue;
    keep.add(new URL(k.url).pathname + new URL(k.url).search);
    for (const a of (res.headers.get('X-NS-Assets') || '').split(',')) if (a) keep.add(a);
    const cover = res.headers.get('X-NS-Cover');
    if (cover) keep.add(cover);
  }
  for (const k of keys) {
    const u = new URL(k.url);
    if (!keep.has(u.pathname + u.search) && !keep.has(u.pathname)) await cache.delete(k);
  }
}

/** Make the saved cache mirror the reader's bookmark list. Returns the paths now available. */
async function syncSaved(posts) {
  const want = new Map();
  for (const p of Array.isArray(posts) ? posts.slice(0, 500) : []) {
    const path = localPath(p && p.url);
    if (path) want.set(path, p.cover);
  }
  const cache = await caches.open(SAVED);
  const have = new Set();
  for (const k of await cache.keys()) {
    if (!isPage(k.url)) continue;
    const u = new URL(k.url);
    const path = u.pathname + u.search;
    if (want.has(path)) have.add(path);
    else await cache.delete(k);
  }
  const missing = [...want.keys()].filter((p) => !have.has(p));
  // Small pool so a big import doesn't hammer the network.
  const workers = Array.from({ length: Math.min(4, missing.length) }, async () => {
    while (missing.length) {
      const path = missing.shift();
      if (await savePost(path, want.get(path))) have.add(path);
    }
  });
  await Promise.all(workers);
  await gcSaved();
  return [...have];
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  const reply = (msg) => {
    try {
      if (event.source && 'postMessage' in event.source) event.source.postMessage(msg);
    } catch {
      /* client went away */
    }
  };
  if (data.type === 'cache-post') {
    event.waitUntil(savePost(data.url, data.cover).then((ok) => reply({ type: 'post-cached', url: data.url, ok })));
  } else if (data.type === 'uncache-post') {
    event.waitUntil(unsavePost(data.url).then(() => reply({ type: 'post-uncached', url: data.url })));
  } else if (data.type === 'sync-saved') {
    event.waitUntil(syncSaved(data.posts).then((urls) => reply({ type: 'saved-synced', urls })));
  }
});
