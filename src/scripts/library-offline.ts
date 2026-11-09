/**
 * Page-side helpers for the offline copy of the library (talks to public/sw.js).
 * Cache names MUST match public/sw.js. Everything degrades to a no-op when service workers
 * or the Cache Storage API are unavailable (dev server, http, private mode…).
 */

export const CACHE_SAVED = 'ns-saved-v1';
export const CACHE_PAGES = 'ns-pages-v1';

export type SWMessage =
  | { type: 'cache-post'; url: string; cover?: string }
  | { type: 'uncache-post'; url: string }
  | { type: 'sync-saved'; posts: { url: string; cover?: string }[] };

export type SWReply =
  | { type: 'updated' }
  | { type: 'post-cached'; url: string; ok: boolean }
  | { type: 'post-uncached'; url: string }
  | { type: 'saved-synced'; urls: string[] };

const hasSW = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
const hasCaches = () => typeof caches !== 'undefined';

/** The active registration for this origin, or undefined (never throws, never hangs). */
export async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!hasSW()) return undefined;
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return undefined;
  }
}

/**
 * Send a message to the active service worker. Works even when this page is not (yet) controlled,
 * e.g. on the very first visit, because it posts to `registration.active` rather than `controller`.
 */
export async function postToSW(msg: SWMessage): Promise<boolean> {
  const reg = await getRegistration();
  const sw = reg?.active ?? navigator.serviceWorker?.controller ?? null;
  if (!sw) return false;
  try {
    sw.postMessage(msg);
    return true;
  } catch {
    return false;
  }
}

/** Make the SW's "saved" cache mirror the bookmark list (adds missing posts, drops removed ones). */
export function syncSaved(bookmarks: { url: string; cover?: string }[]) {
  return postToSW({ type: 'sync-saved', posts: bookmarks.map((b) => ({ url: b.url, cover: b.cover })) });
}

export function onSWMessage(handler: (msg: SWReply) => void): void {
  if (!hasSW()) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    const data = e.data as SWReply | undefined;
    if (data && typeof data === 'object' && typeof data.type === 'string') handler(data);
  });
}

/** Normalise a cache key / URL to a pathname ("/bai-viet/x/"). */
export function toPath(url: string): string {
  try {
    return new URL(url, location.origin).pathname;
  } catch {
    return url;
  }
}

/** Pathnames of HTML pages currently readable offline, per cache. */
export async function offlineIndex(): Promise<{ saved: Set<string>; pages: Set<string> }> {
  const out = { saved: new Set<string>(), pages: new Set<string>() };
  if (!hasCaches()) return out;
  const collect = async (name: string, into: Set<string>) => {
    try {
      if (!(await caches.has(name))) return;
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const path = toPath(req.url);
        // Pages are stored with a trailing slash (trailingSlash: 'always'); skip assets & JSON.
        if (path.endsWith('/')) into.add(path);
      }
    } catch {
      /* storage blocked */
    }
  };
  await Promise.all([collect(CACHE_SAVED, out.saved), collect(CACHE_PAGES, out.pages)]);
  return out;
}

/** All pathnames readable offline (saved ∪ recently visited). */
export async function offlineUrls(): Promise<Set<string>> {
  const { saved, pages } = await offlineIndex();
  return new Set([...saved, ...pages]);
}
