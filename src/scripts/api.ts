/**
 * Browser client for the Worker API (/api/*): views, reactions, newsletter.
 *
 * - Every call has a timeout; failures never throw into the page (widgets just stay hidden).
 * - Availability is remembered for the tab in sessionStorage 'ns:api' ('1' | '0:<timestamp>'), so after one
 *   failure the next pages skip the network for a couple of minutes. ViewCount/Reactions read the same key
 *   from a tiny inline script to hide themselves before first paint.
 * - getStats() de-duplicates and batches: several widgets asking for the same post share one request.
 * - Every write response is broadcast as `ns:stats` { slug, views, reactions } so all widgets stay in sync.
 * Contract: worker/shared.ts.
 */
import {
  MAX_BATCH,
  REACTION_KINDS,
  emptyStats,
  isReactionKind,
  isValidEmail,
  isValidSlug,
  type ReactionKind,
  type Stats,
  type SubscribeResult,
  type WriteResult,
} from '../../worker/shared';
import { read, write } from '../lib/storage';

export { REACTION_KINDS, isReactionKind, isValidEmail, type ReactionKind, type Stats, type WriteResult, type SubscribeResult };

const BASE = '/api';
export const AVAILABILITY_KEY = 'ns:api';
const FRESH_KEY = 'ns:api-fresh';
/** How long a failed probe keeps the widgets off before trying again. */
export const DOWN_TTL = 2 * 60_000;
const DEFAULT_TIMEOUT = 5000;

/* ------------------------------------------------------------ sessionStorage */

function ssGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function ssSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage */
  }
}

/** true = API answered this session, false = failed recently, null = unknown. */
export function knownAvailability(now = Date.now()): boolean | null {
  const v = ssGet(AVAILABILITY_KEY);
  if (v === '1') return true;
  if (v?.startsWith('0:') && now - Number(v.slice(2)) < DOWN_TTL) return false;
  return null;
}

function markAvailability(up: boolean) {
  ssSet(AVAILABILITY_KEY, up ? '1' : `0:${Date.now()}`);
}

/* ------------------------------------------------------------------- fetch */

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 for network error / timeout / non-JSON answer (API not deployed). */
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit & { timeout?: number } = {}): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...rest,
      signal: ctrl.signal,
      headers: { accept: 'application/json', ...(rest.body ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    });
  } catch (err) {
    clearTimeout(timer);
    markAvailability(false);
    throw new ApiError(0, (err as Error)?.name === 'AbortError' ? 'timeout' : 'network');
  }
  clearTimeout(timer);

  // A static host without the Worker answers with an HTML 404 page; a crashed Worker with 5xx.
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data: unknown = isJson ? await res.json().catch(() => null) : null;
  if (!isJson || data === null || res.status >= 500) {
    markAvailability(false);
    throw new ApiError(isJson ? res.status : 0, (data as { error?: string } | null)?.error || 'unavailable', data);
  }
  markAvailability(true);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `HTTP ${res.status}`, data);
  return data as T;
}

let probe: Promise<boolean> | null = null;

/** Is the API reachable (and its database bound)? Cached for the tab; one network probe at most. */
export function apiAvailable(): Promise<boolean> {
  const known = knownAvailability();
  if (known !== null) return Promise.resolve(known);
  probe ??= apiFetch<{ ok?: boolean; db?: boolean }>('/health', { timeout: 3000 })
    .then((d) => {
      const up = d.ok === true && d.db !== false;
      markAvailability(up);
      return up;
    })
    .catch(() => false)
    .finally(() => {
      probe = null;
    });
  return probe;
}

/* ------------------------------------------------------------------- stats */

/** Defensive copy of a server Stats object (never trust shapes across the wire). */
export function sanitizeStats(raw: unknown, slug: string): Stats {
  const out = emptyStats(slug);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { views?: unknown; reactions?: Record<string, unknown> };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  out.views = num(r.views);
  for (const k of REACTION_KINDS) out.reactions[k] = num(r.reactions?.[k]);
  return out;
}

const statsCache = new Map<string, Promise<Stats | null>>();
let queue: { slug: string; resolve: (s: Stats | null) => void }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** After our own write, skip the 30 s HTTP cache of GET /api/stats for a minute. */
function recentlyWrote() {
  return Date.now() - Number(ssGet(FRESH_KEY) || 0) < 60_000;
}

async function flush() {
  flushTimer = null;
  const batch = queue;
  queue = [];
  const fail = (items: typeof batch) =>
    items.forEach((b) => {
      statsCache.delete(b.slug); // allow a later retry
      b.resolve(null);
    });

  if (knownAvailability() === false) return fail(batch);
  const cache: RequestCache = recentlyWrote() ? 'no-cache' : 'default';

  for (let i = 0; i < batch.length; i += MAX_BATCH) {
    const chunk = batch.slice(i, i + MAX_BATCH);
    try {
      let bySlug: Record<string, unknown>;
      if (chunk.length === 1) {
        const one = chunk[0]!;
        bySlug = { [one.slug]: await apiFetch<Stats>(`/stats?slug=${encodeURIComponent(one.slug)}`, { cache }) };
      } else {
        const q = chunk.map((b) => encodeURIComponent(b.slug)).join(',');
        bySlug = (await apiFetch<{ stats: Record<string, unknown> }>(`/stats?slugs=${q}`, { cache })).stats ?? {};
      }
      chunk.forEach((b) => b.resolve(sanitizeStats(bySlug[b.slug], b.slug)));
    } catch {
      fail(chunk);
    }
  }
}

/**
 * Stats for one post, or null when the API is unavailable. Calls made in the same tick are batched into
 * one GET /api/stats?slugs=…, and repeated calls for the same slug share one request.
 */
export function getStats(slug: string): Promise<Stats | null> {
  if (!isValidSlug(slug)) return Promise.resolve(null);
  const hit = statsCache.get(slug);
  if (hit) return hit;
  const p = new Promise<Stats | null>((resolve) => {
    queue.push({ slug, resolve });
    flushTimer ??= setTimeout(flush, 0);
  });
  statsCache.set(slug, p);
  return p;
}

function publish(result: WriteResult) {
  const stats = sanitizeStats(result, result.slug);
  statsCache.set(result.slug, Promise.resolve(stats));
  ssSet(FRESH_KEY, String(Date.now()));
  document.dispatchEvent(new CustomEvent('ns:stats', { detail: stats }));
}

/** Count one view (the server ignores duplicates from the same reader on the same day). */
export async function recordView(slug: string): Promise<WriteResult | null> {
  try {
    const res = await apiFetch<WriteResult>('/view', { method: 'POST', body: JSON.stringify({ slug }), keepalive: true });
    publish(res);
    return { ...sanitizeStats(res, slug), counted: res.counted === true };
  } catch {
    return null;
  }
}

/** Add (or with undo=true remove) a reaction. Throws ApiError so the UI can roll back and explain. */
export async function sendReaction(slug: string, kind: ReactionKind, undo = false): Promise<WriteResult> {
  const res = await apiFetch<WriteResult>('/react', {
    method: 'POST',
    body: JSON.stringify(undo ? { slug, kind, undo: true } : { slug, kind }),
  });
  publish(res);
  return { ...sanitizeStats(res, slug), counted: res.counted === true };
}

export async function subscribe(payload: {
  email: string;
  website?: string;
  token?: string;
  source?: string;
}): Promise<SubscribeResult> {
  try {
    return await apiFetch<SubscribeResult>('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ website: '', ...payload }),
      timeout: 10_000,
    });
  } catch (err) {
    const e = err as ApiError;
    const msg = (e.data as { error?: string } | undefined)?.error;
    if (msg) return { ok: false, error: msg };
    return {
      ok: false,
      error: e.status === 0 ? 'Mất kết nối tới máy chủ. Bạn kiểm tra mạng rồi thử lại nhé.' : 'Chưa đăng ký được, bạn thử lại sau nhé.',
    };
  }
}

/* -------------------------------------------------------------- formatting */

const compactFmt = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const fullFmt = new Intl.NumberFormat('vi-VN');

/** 1234 → "1,2 N", 1200000 → "1,2 Tr" (Vietnamese compact notation). */
export const formatCompact = (n: number) => compactFmt.format(n);
/** 1234 → "1.234" */
export const formatFull = (n: number) => fullFmt.format(n);

/* -------------------------------------------------- engagement & local state */

/**
 * Calls `cb` once the reader is engaged: the tab has been visible for `visibleMs` in total, or the
 * reading progress (`ns:progress`) reached `progress`. Returns a cleanup function.
 */
export function whenEngaged(cb: () => void, { visibleMs = 10_000, progress = 0.3 } = {}): () => void {
  let done = false;
  let spent = 0;
  let since = document.visibilityState === 'visible' ? Date.now() : -1;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('ns:progress', onProgress);
  };
  const fire = () => {
    if (done) return;
    done = true;
    cleanup();
    cb();
  };
  const arm = () => {
    clearTimeout(timer);
    if (since >= 0) timer = setTimeout(fire, Math.max(0, visibleMs - spent));
  };
  function onVisibility() {
    if (document.visibilityState === 'visible') {
      since = Date.now();
      arm();
    } else {
      if (since >= 0) spent += Date.now() - since;
      since = -1;
      clearTimeout(timer);
    }
  }
  function onProgress(e: Event) {
    const p = (e as CustomEvent<{ progress?: number }>).detail?.progress;
    if (typeof p === 'number' && p >= progress) fire();
  }

  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('ns:progress', onProgress);
  arm();
  return cleanup;
}

const VIEWED_KEY = 'ns:viewed';

/** Has this tab session already sent a view for this post? */
export function viewedThisSession(slug: string): boolean {
  try {
    return (JSON.parse(ssGet(VIEWED_KEY) || '[]') as string[]).includes(slug);
  } catch {
    return false;
  }
}

export function markViewed(slug: string) {
  let list: string[] = [];
  try {
    list = JSON.parse(ssGet(VIEWED_KEY) || '[]') as string[];
  } catch {
    /* corrupted */
  }
  if (!Array.isArray(list)) list = [];
  if (!list.includes(slug)) list.push(slug);
  ssSet(VIEWED_KEY, JSON.stringify(list.slice(-200)));
}

/** Reactions this browser has given, per post (localStorage 'ns:reactions', see docs/DESIGN.md). */
export function myReactions(slug: string): ReactionKind[] {
  const all = read<Record<string, unknown>>('reactions', {});
  const list = all && typeof all === 'object' ? all[slug] : undefined;
  return Array.isArray(list) ? REACTION_KINDS.filter((k) => list.includes(k)) : [];
}

const MAX_REACTED_POSTS = 300;

export function saveMyReactions(slug: string, kinds: ReactionKind[]) {
  const raw = read<Record<string, string[]>>('reactions', {});
  const all: Record<string, string[]> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  delete all[slug]; // re-insert at the end → most recent last
  if (kinds.length) all[slug] = REACTION_KINDS.filter((k) => kinds.includes(k));
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_REACTED_POSTS))) delete all[k];
  write('reactions', all);
}
