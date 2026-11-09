// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ApiModule = typeof import('../../src/scripts/api');

/** Fresh module per test: api.ts keeps per-page caches in module scope. */
async function load(): Promise<ApiModule> {
  vi.resetModules();
  return import('../../src/scripts/api');
}

const stats = (slug: string, views = 0) => ({
  slug,
  views,
  reactions: { like: 1, love: 2, fire: 0, mindblown: 0, clap: 0 },
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('formatting', () => {
  it('uses Vietnamese compact notation', async () => {
    const { formatCompact, formatFull } = await load();
    expect(formatCompact(7)).toBe('7');
    expect(formatCompact(1234).replace(/\s/g, ' ')).toBe('1,2 N');
    expect(formatCompact(1_200_000).replace(/\s/g, ' ')).toBe('1,2 Tr');
    expect(formatFull(1234)).toBe('1.234');
  });
});

describe('sanitizeStats', () => {
  it('keeps only sane non-negative integers for known kinds', async () => {
    const { sanitizeStats } = await load();
    expect(sanitizeStats({ views: 3.7, reactions: { like: -1, love: '5', fire: 2, hack: 9 } }, 'a')).toEqual({
      slug: 'a',
      views: 3,
      reactions: { like: 0, love: 0, fire: 2, mindblown: 0, clap: 0 },
    });
    expect(sanitizeStats(null, 'b').views).toBe(0);
  });
});

describe('getStats', () => {
  it('shares one request per slug and batches slugs asked in the same tick', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('slugs=')) return jsonResponse({ stats: { a: stats('a', 5), b: stats('b', 9) } });
      return jsonResponse(stats('a', 5));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getStats } = await load();

    const [a1, a2, b] = await Promise.all([getStats('a'), getStats('a'), getStats('b')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/stats?slugs=a,b');
    expect(a1).toBe(a2);
    expect(a1?.views).toBe(5);
    expect(b?.views).toBe(9);

    await getStats('a'); // cached for the page
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses ?slug= for a single post and rejects bad slugs without a request', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse(stats('xin-chao', 2)));
    vi.stubGlobal('fetch', fetchMock);
    const { getStats } = await load();
    expect(await getStats('../x')).toBeNull();
    expect((await getStats('xin-chao'))?.views).toBe(2);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/stats?slug=xin-chao');
  });

  it('returns null and remembers the API is down when the host serves HTML (no Worker)', async () => {
    const fetchMock = vi.fn(async () => new Response('<!doctype html><h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await load();
    expect(await api.getStats('a')).toBeNull();
    expect(sessionStorage.getItem('ns:api')).toMatch(/^0:\d+$/);
    expect(api.knownAvailability()).toBe(false);

    expect(await api.getStats('b')).toBeNull(); // short-circuits, no second request
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await api.apiAvailable()).toBe(false);
  });

  it('treats a network error as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const api = await load();
    expect(await api.getStats('a')).toBeNull();
    expect(api.knownAvailability()).toBe(false);
  });

  it('forgets a failure after DOWN_TTL', async () => {
    const api = await load();
    sessionStorage.setItem('ns:api', `0:${Date.now() - api.DOWN_TTL - 1}`);
    expect(api.knownAvailability()).toBeNull();
  });
});

describe('writes', () => {
  it('recordView posts JSON and broadcasts ns:stats', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...stats('a', 11), counted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await load();
    const seen: unknown[] = [];
    document.addEventListener('ns:stats', (e) => seen.push((e as CustomEvent).detail), { once: true });

    const res = await api.recordView('a');
    expect(res).toMatchObject({ slug: 'a', views: 11, counted: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/view');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ slug: 'a' });
    expect(seen).toEqual([stats('a', 11)]);
    expect((await api.getStats('a'))?.views).toBe(11); // cache updated, no extra request
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sendReaction throws ApiError with the server message on 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'Bạn thao tác hơi nhanh' }, 429)));
    const api = await load();
    await expect(api.sendReaction('a', 'love')).rejects.toMatchObject({ status: 429, message: 'Bạn thao tác hơi nhanh' });
    expect(api.knownAvailability()).toBe(true); // the API answered; it is up
  });

  it('subscribe returns the server error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'Email chưa đúng định dạng' }, 400)));
    const api = await load();
    expect(await api.subscribe({ email: 'x' })).toEqual({ ok: false, error: 'Email chưa đúng định dạng' });
  });

  it('subscribe explains a network failure in Vietnamese', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const api = await load();
    const res = await api.subscribe({ email: 'a@b.com' });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/kết nối/);
  });
});

describe('whenEngaged', () => {
  it('fires after 10 s of visible time, pausing while hidden', async () => {
    vi.useFakeTimers();
    const { whenEngaged } = await load();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const cb = vi.fn();
    whenEngaged(cb);

    vi.advanceTimersByTime(6000);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000); // hidden time doesn't count
    expect(cb).not.toHaveBeenCalled();

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(3900);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires once at 30% reading progress', async () => {
    vi.useFakeTimers();
    const { whenEngaged } = await load();
    const cb = vi.fn();
    whenEngaged(cb);
    document.dispatchEvent(new CustomEvent('ns:progress', { detail: { progress: 0.2 } }));
    expect(cb).not.toHaveBeenCalled();
    document.dispatchEvent(new CustomEvent('ns:progress', { detail: { progress: 0.31 } }));
    document.dispatchEvent(new CustomEvent('ns:progress', { detail: { progress: 0.5 } }));
    vi.advanceTimersByTime(20_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('local state', () => {
  it('remembers views per tab session', async () => {
    const api = await load();
    expect(api.viewedThisSession('a')).toBe(false);
    api.markViewed('a');
    api.markViewed('a');
    expect(api.viewedThisSession('a')).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('ns:viewed')!)).toEqual(['a']);
  });

  it('stores reactions as Record<postId, kind[]> under ns:reactions', async () => {
    const api = await load();
    api.saveMyReactions('a', ['love', 'like']);
    api.saveMyReactions('b', ['fire']);
    expect(api.myReactions('a')).toEqual(['like', 'love']);
    expect(JSON.parse(localStorage.getItem('ns:reactions')!)).toEqual({ a: ['like', 'love'], b: ['fire'] });
    api.saveMyReactions('a', []);
    expect(JSON.parse(localStorage.getItem('ns:reactions')!)).toEqual({ b: ['fire'] });
  });

  it('ignores corrupted storage', async () => {
    localStorage.setItem('ns:reactions', '"oops"');
    sessionStorage.setItem('ns:viewed', '{bad');
    const api = await load();
    expect(api.myReactions('a')).toEqual([]);
    expect(api.viewedThisSession('a')).toBe(false);
    api.saveMyReactions('a', ['clap']);
    expect(api.myReactions('a')).toEqual(['clap']);
  });
});
