/* Nhịp Số — service worker
 *
 * Caches (all prefixed "ns-"; any other "ns-" cache is deleted on activate):
 *   ns-static-<VERSION>  precache: /offline/ and / (+ the CSS/JS they need), icons, manifest.
 *                        Re-fetched on every SW install and, while online, at most every 6 h,
 *                        so it follows deploys even when this file doesn't change.
 *   ns-pages-v1          HTML of pages you visited (network-first, capped, LRU-ish)
 *   ns-assets-v1         /_astro/* CSS/JS — content-hashed → cache-first (capped)
 *   ns-fonts-v1          fonts — cache-first (capped; separate so page churn can't evict them)
 *   ns-images-v1         images — /_astro/* cache-first, /covers/*, /og/*… stale-while-revalidate (capped)
 *   ns-search-v1         Pagefind (hashed fragments cache-first, entry/js network-first) + search-index.json
 *   ns-saved-v1          articles the reader bookmarked + their CSS/JS/images — never evicted;
 *                        changed only by messages from the page (cache-post / uncache-post / sync-saved)
 * Never touched: non-GET, other origins, /api/*, /admin/*, /cdn-cgi/*, range requests.
 *
 * HTML is ALWAYS network-first, so a deploy is visible on the next online navigation; cached HTML
 * is only used when the network fails, answers 5xx, or takes longer than NAV_TIMEOUT.
 * Bump VERSION when the precache list or cache layout changes.
 */
const VERSION = 'v2';
const STATIC = `ns-static-${VERSION}`;
const PAGES = 'ns-pages-v1';
const ASSETS = 'ns-assets-v1';
const FONTS = 'ns-fonts-v1';
const IMAGES = 'ns-images-v1';
const SEARCH = 'ns-search-v1';
const SAVED = 'ns-saved-v1';
const KEEP = [STATIC, PAGES, ASSETS, FONTS, IMAGES, SEARCH, SAVED];
const LIMITS = { [PAGES]: 60, [ASSETS]: 200, [FONTS]: 60, [IMAGES]: 120, [SEARCH]: 200 };

const OFFLINE_URL = '/offline/';
const PRECACHE_FILES = ['/manifest.webmanifest', '/favicon.svg', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
/** Marker written by an install that replaces a running SW; consumed on activate. */
const UPDATE_FLAG = '/__ns-sw-updated';
const NAV_TIMEOUT = 3000;
const SHELL_MAX_AGE = 6 * 3600 * 1000;
const SHELL_CHECK_EVERY = 30 * 60 * 1000;

const ORIGIN = self.location.origin;
const MATCH = { ignoreVary: true };

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function isBlocked(path) {
  return /^\/(?:api|admin|cdn-cgi)(?:\/|$)/.test(path) || path === '/sw.js';
}

const HAS_EXT = /\.[a-z0-9]+$/i;
const IMG_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i;
const FONT_EXT = /\.(?:woff2?|ttf|otf)$/i;
const isImage = (req, path) => req.destination === 'image' || IMG_EXT.test(path);
const isFont = (req, path) => req.destination === 'font' || FONT_EXT.test(path);
/** Pagefind files whose names carry a content hash (safe to cache forever). */
const isHashedPagefind = (path) => /^\/pagefind\/(?:fragment|index|filter)\//.test(path) || /\.pf_meta$/.test(path);
const isPagePath = (path) => path.endsWith('/');

/** Same-origin, non-blocked pathname for a URL coming from a message — or null. Query/hash dropped. */
function localPath(input) {
  if (typeof input !== 'string' || !input) return null;
  try {
    const u = new URL(input, ORIGIN);
    if (u.origin !== ORIGIN || isBlocked(u.pathname)) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

/** Pages are static (the query never changes the HTML) and live at "/dir/" (trailingSlash: always). */
function pagePath(input) {
  const p = localPath(input);
  if (!p) return null;
  return isPagePath(p) || HAS_EXT.test(p) ? p : `${p}/`;
}
const pageKey = (path) => new URL(path, ORIGIN).href;

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

const cacheable = (res) => !!res && res.ok && res.type === 'basic';
const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');

const trimming = new Map();
/** Delete the oldest entries above the cap (Cache Storage keeps insertion order; put() re-appends). */
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

/**
 * HTML stored with our own metadata. Built from text, so it is never "redirected" (navigations
 * reject those) and must not keep the transport headers of the original body.
 */
function htmlResponse(html, from, extra = {}) {
  const headers = new Headers(from.headers);
  for (const h of ['content-length', 'content-encoding', 'transfer-encoding', 'set-cookie']) headers.delete(h);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-NS-Cached-At', String(Date.now()));
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(html, { status: 200, statusText: 'OK', headers });
}

/* ---------- What a page needs to work offline ---------- */

const LOCAL_ASSET = /^\/(?:_astro|covers|og)\//;
const JS_IMPORT_RE = /(?:\bfrom|\bimport)\s*\(?\s*["']((?:\.{1,2}\/|\/_astro\/)[^"']+?\.js)["']/g;

function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** The largest srcset candidate (else src): one good copy; other sizes fall back to it offline. */
function pickImage(tag) {
  const srcset = attr(tag, 'srcset');
  if (srcset) {
    let best = null;
    let bestW = -1;
    for (const part of srcset.split(',')) {
      const [u, d] = part.trim().split(/\s+/);
      const w = parseFloat(d || '') || 1;
      if (u && w > bestW) {
        best = u;
        bestW = w;
      }
    }
    if (best) return best;
  }
  return attr(tag, 'src');
}

/** CSS/JS (and optionally images) a page references, as root-relative /_astro/, /covers/, /og/ paths. */
function extractAssets(html, { images = true } = {}) {
  const out = new Set();
  const add = (u) => {
    if (!u) return;
    const p = localPath(u.replace(/&amp;/g, '&'));
    if (p && LOCAL_ASSET.test(p)) out.add(p);
  };
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/\brel\s*=\s*["']?(?:stylesheet|modulepreload)\b/i.test(tag)) add(attr(tag, 'href'));
  }
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) add(attr(tag, 'src'));
  if (images) {
    // Thumbnails of *other* posts (related cards) aren't needed to read this one offline.
    const own = html.replace(/<article class="post-card[\s\S]*?<\/article>/g, '');
    for (const [tag] of own.matchAll(/<img\b[^>]*>/gi)) add(pickImage(tag));
  }
  return [...out];
}

/** Get an asset into `cache` — reusing a copy from any cache unless `fresh`. */
async function cacheAsset(cache, path, fresh = false) {
  if (!fresh) {
    const own = await cache.match(path, MATCH);
    if (own) return own;
    const other = await caches.match(path, MATCH);
    if (other) {
      await cache.put(path, other.clone());
      return other;
    }
  }
  const res = await fetch(path, { credentials: 'same-origin', cache: fresh ? 'no-cache' : 'default' });
  if (!cacheable(res)) throw new Error(`HTTP ${res.status} ${path}`);
  await cache.put(path, res.clone());
  return res;
}

/** Cache a page's assets plus the JS chunks its scripts import (so it works fully offline). */
async function cachePageAssets(cache, html, opts) {
  const all = new Set(extractAssets(html, opts));
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
      all.delete(js); // missing chunk: the page still renders, only that script is lost
    }
  }
  return [...all];
}

/** Store page HTML (+ its assets) in `cache` under `path`. */
async function storePage(cache, path, html, from, extra = {}, opts) {
  const assets = await cachePageAssets(cache, html, opts);
  await cache.put(pageKey(path), htmlResponse(html, from, { 'X-NS-Assets': assets.join(','), ...extra }));
  return assets;
}

/** Fetch a page fresh and store it (+ its assets). Throws if the page can't be fetched. */
async function cachePage(cache, path, extra = {}, opts) {
  const res = await fetch(new Request(path, { cache: 'no-cache', credentials: 'same-origin' }));
  if (!cacheable(res) || !isHtml(res)) throw new Error(`HTTP ${res.status} ${path}`);
  return storePage(cache, path, await res.text(), res, extra, opts);
}

/** Drop entries no stored page references any more (pages + X-NS-Assets + X-NS-Cover + `alsoKeep`). */
async function gcCache(name, alsoKeep = []) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const keep = new Set(alsoKeep);
  for (const k of keys) {
    const path = new URL(k.url).pathname;
    if (!isPagePath(path)) continue;
    keep.add(path);
    const res = await cache.match(k, MATCH);
    for (const a of (res?.headers.get('X-NS-Assets') || '').split(',')) if (a) keep.add(a);
    const cover = res?.headers.get('X-NS-Cover');
    if (cover) keep.add(cover);
  }
  for (const k of keys) if (!keep.has(new URL(k.url).pathname)) await cache.delete(k);
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */

const SHELL_OPTS = { images: false };

async function precacheShell(cache) {
  await cachePage(cache, OFFLINE_URL, {}, SHELL_OPTS); // required: without it there is no offline fallback
  await Promise.allSettled([cachePage(cache, '/', {}, SHELL_OPTS), ...PRECACHE_FILES.map((p) => cacheAsset(cache, p, true))]);
}

self.addEventListener('install', (event) => {
  // An active worker already exists → this install is an update, not the first visit.
  const replacing = !!self.registration.active;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC);
      await precacheShell(cache);
      await gcCache(STATIC, PRECACHE_FILES);
      if (replacing) await cache.put(UPDATE_FLAG, new Response('1'));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('ns-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
      const cache = await caches.open(STATIC);
      if (await cache.delete(UPDATE_FLAG)) {
        for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'updated' });
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
  if (path === '/search-index.json') {
    event.respondWith(networkFirst(event, SEARCH));
    return;
  }
  if (isFont(req, path)) {
    event.respondWith(cacheFirst(event, FONTS));
    return;
  }
  if (isImage(req, path)) {
    event.respondWith(path.startsWith('/_astro/') ? cacheFirst(event, IMAGES) : staleWhileRevalidate(event, IMAGES));
    return;
  }
  if (path.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(event, ASSETS));
  }
  // Everything else: the browser's normal network behaviour.
});

/** A cached copy of a page from any page cache; tolerant to a missing trailing slash and any query. */
async function matchPage(urlString) {
  const path = pagePath(urlString);
  if (!path) return undefined;
  const key = pageKey(path);
  for (const cacheName of [PAGES, SAVED, STATIC]) {
    const hit = await caches.match(key, { cacheName, ignoreSearch: true, ...MATCH });
    if (hit) return hit;
  }
  return undefined;
}

async function offlineFallback() {
  const hit = await caches.match(pageKey(OFFLINE_URL), { cacheName: STATIC, ...MATCH });
  if (hit) return hit;
  return new Response(
    '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Bạn đang offline · Nhịp Số</title><style>:root{color-scheme:light dark}body{font:17px/1.6 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 20px}button{font:inherit;min-height:44px;padding:0 18px}</style>' +
      '<h1>Bạn đang offline</h1><p>Không tải được trang này. Kiểm tra kết nối mạng rồi thử lại nhé.</p><p><button onclick="location.reload()">Thử lại</button></p></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

/** Network-first with a ~3 s timeout → cached copy → /offline/. */
async function navigate(event) {
  const req = event.request;
  const network = (async () => {
    const preloaded = await Promise.resolve(event.preloadResponse).catch(() => undefined);
    const res = preloaded || (await fetch(req));
    if (cacheable(res) && isHtml(res)) event.waitUntil(afterNavigation(req.url, res.clone()));
    return res;
  })();
  // Keep the worker alive until the network settles, even if we answered from cache first.
  event.waitUntil(network.catch(() => {}));

  let res;
  try {
    res = await withTimeout(network, NAV_TIMEOUT);
  } catch {
    const cached = await matchPage(req.url);
    if (cached) return cached;
    try {
      return await network; // slow but alive: keep waiting rather than showing "offline"
    } catch {
      return offlineFallback();
    }
  }
  if (res.status >= 500) return (await matchPage(req.url)) || res;
  return res;
}

/** Store a fresh page; refresh the saved copy if it's a bookmarked article; keep the shell fresh. */
async function afterNavigation(urlString, res) {
  try {
    const path = pagePath(urlString);
    if (!path) return;
    const html = await res.text();
    await put(PAGES, pageKey(path), htmlResponse(html, res));
    const savedCache = await caches.open(SAVED);
    const saved = await savedCache.match(pageKey(path), MATCH);
    if (saved) {
      const cover = saved.headers.get('X-NS-Cover') || '';
      await storePage(savedCache, path, html, res, cover ? { 'X-NS-Cover': cover } : {});
      await gcCache(SAVED);
    }
    await refreshShell();
  } catch {
    /* best effort */
  }
}

let shellCheckedAt = 0;
/** While online, re-precache /offline/ and / when older than SHELL_MAX_AGE (so they match the current deploy). */
async function refreshShell() {
  if (Date.now() - shellCheckedAt < SHELL_CHECK_EVERY) return;
  shellCheckedAt = Date.now();
  const cache = await caches.open(STATIC);
  const hit = await cache.match(pageKey(OFFLINE_URL), MATCH);
  const at = Number(hit && hit.headers.get('X-NS-Cached-At')) || 0;
  if (Date.now() - at < SHELL_MAX_AGE) return;
  await precacheShell(cache);
  await gcCache(STATIC, PRECACHE_FILES);
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
    if (name === IMAGES) return (await siblingImage(new URL(req.url).pathname)) || imagePlaceholder();
    return Response.error();
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
    return (await caches.match(req, MATCH)) || Response.error();
  }
}

/** "/_astro/cover.AbCd1234_x9Y.webp" → "/_astro/cover.AbCd1234" (all sizes of one Astro image share it). */
const VARIANT_RE = /^(\/_astro\/.+\.[\w-]{8})(?:_[\w-]+)?\.(?:webp|avif|png|jpe?g|gif)$/i;

/** Offline and this size isn't cached? Any other cached size of the same picture is better than nothing. */
async function siblingImage(path) {
  const m = VARIANT_RE.exec(path);
  if (!m) return undefined;
  const base = m[1];
  for (const name of [SAVED, IMAGES, STATIC]) {
    try {
      if (!(await caches.has(name))) continue;
      const cache = await caches.open(name);
      for (const k of await cache.keys()) {
        const p = new URL(k.url).pathname;
        if (p !== path && (p.startsWith(`${base}_`) || p.startsWith(`${base}.`)) && IMG_EXT.test(p)) {
          const hit = await cache.match(k, MATCH);
          if (hit) return hit;
        }
      }
    } catch {
      /* storage blocked */
    }
  }
  return undefined;
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
  const path = pagePath(url);
  if (!path || !isPagePath(path)) return false;
  const coverPath = localPath(cover) || '';
  const cache = await caches.open(SAVED);
  const extra = coverPath ? { 'X-NS-Cover': coverPath } : {};
  let ok = false;
  try {
    await cachePage(cache, path, extra);
    ok = true;
  } catch {
    // Offline right now? Promote the copy we already have from a recent visit.
    const hit = await matchPage(pageKey(path));
    if (hit) {
      try {
        await storePage(cache, path, await hit.text(), hit, extra);
        ok = true;
      } catch {
        /* storage full */
      }
    }
  }
  if (ok && coverPath) await cacheAsset(cache, coverPath).catch(() => {});
  return ok;
}

async function unsavePost(url) {
  const path = pagePath(url);
  if (!path) return;
  const cache = await caches.open(SAVED);
  await cache.delete(pageKey(path), MATCH);
  await gcCache(SAVED);
}

/** Make the saved cache mirror the reader's bookmark list. Returns the paths now available. */
async function syncSaved(posts) {
  const want = new Map();
  for (const p of Array.isArray(posts) ? posts.slice(0, 500) : []) {
    const path = pagePath(p && p.url);
    if (path && isPagePath(path)) want.set(path, p.cover);
  }
  const cache = await caches.open(SAVED);
  const have = new Set();
  for (const k of await cache.keys()) {
    const path = new URL(k.url).pathname;
    if (!isPagePath(path)) continue;
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
  await gcCache(SAVED);
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
