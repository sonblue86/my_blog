/**
 * Full-text search via Pagefind (only exists after `npm run build`), shared by the palette and /tim-kiem/.
 *
 * Two Vietnamese-specific fixes on top of Pagefind:
 *  - Pagefind folds every diacritic except "đ", so an accent-less "duong" also searches "đuong" (→ "đường").
 *  - Pagefind falls back to loose partial matches when nothing matches; hits whose text doesn't contain every
 *    query word (accent-insensitive, at a word start) are dropped, so "tri tue" no longer returns every post.
 */
import { fold } from '../lib/text';
import { terms, type Hit } from './search-core';

interface PagefindResult {
  data: () => Promise<{
    url: string;
    content?: string;
    excerpt?: string;
    meta?: Record<string, string>;
    sub_results?: { title: string; url: string }[];
  }>;
}
export interface Pagefind {
  options: (o: object) => Promise<void>;
  init: () => void;
  search: (q: string, o?: object) => Promise<null | { results: PagefindResult[] }>;
  debouncedSearch: (q: string, o: object, ms: number) => Promise<null | { results: PagefindResult[] }>;
}

let instance: Pagefind | null | undefined;

export async function loadPagefind(excerptLength = 22): Promise<Pagefind | null> {
  if (instance !== undefined) return instance;
  try {
    const url = '/pagefind/pagefind.js'; // variable path: a literal import breaks the Astro build
    instance = (await import(/* @vite-ignore */ url)) as Pagefind;
    await instance.options({ excerptLength, ranking: { metaWeights: { title: 5, ascii: 3 } } });
    instance.init();
  } catch {
    instance = null;
  }
  return instance;
}

/** Query variants to send: the original, plus "đ" at word starts when the query was typed without accents. */
export function queryVariants(q: string): string[] {
  const out = [q];
  const typedWithoutAccents = fold(q) === q.toLowerCase();
  if (typedWithoutAccents && /(^|\s)d/i.test(q)) out.push(q.replace(/(^|\s)d/gi, '$1đ'));
  return out;
}

/** Every query word must start a word in the (folded) text. */
export function isRelevant(text: string, ts: string[]): boolean {
  const hay = ` ${fold(text).replace(/[^a-z0-9]+/g, ' ')}`;
  return ts.every((t) => hay.includes(` ${t}`));
}

/**
 * Full-text hits for `q` (empty list when Pagefind is unavailable or fails — never throws).
 * `debounce` > 0 uses Pagefind's debounced search; returns null when a newer search superseded this one.
 */
export async function fullTextSearch(q: string, categoryName: string | undefined, limit: number, debounce = 0): Promise<Hit[] | null> {
  const pf = await loadPagefind();
  if (!pf) return [];
  const ts = terms(q);
  const opts = categoryName ? { filters: { category: categoryName } } : {};
  try {
    const variants = queryVariants(q);
    const responses = await Promise.all(
      variants.map((v, i) => (i === 0 && debounce > 0 ? pf.debouncedSearch(v, opts, debounce) : pf.search(v, opts))),
    );
    if (responses[0] === null) return null; // superseded by a newer keystroke
    const byUrl = new Map<string, Hit>();
    for (const res of responses) {
      if (!res) continue;
      const data = await Promise.all(res.results.slice(0, limit).map((r) => r.data()));
      data.forEach((d, k) => {
        if (!isRelevant(`${d.meta?.title ?? ''} ${d.meta?.ascii ?? ''} ${d.content ?? ''}`, ts)) return;
        const hit: Hit = {
          url: d.url,
          title: d.meta?.title ?? d.url,
          excerpt: d.excerpt ?? '', // HTML-safe from Pagefind (<mark> only)
          category: d.meta?.category ?? '',
          minutes: Number(d.meta?.minutes) || 0,
          date: d.meta?.date ?? '',
          score: 9 - k * 0.5,
          sub: (d.sub_results ?? []).filter((s) => s.url.includes('#')).map((s) => ({ title: s.title, url: s.url })),
        };
        const prev = byUrl.get(hit.url);
        if (!prev || prev.score < hit.score) byUrl.set(hit.url, hit);
      });
    }
    return [...byUrl.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  } catch {
    return []; // e.g. offline: the index metadata can't load — instant results still show
  }
}
