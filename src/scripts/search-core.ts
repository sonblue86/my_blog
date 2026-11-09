/** Pure search helpers (unit-tested): accent-insensitive matching, scoring and highlighting. */
import { fold } from '../lib/text';

export interface IndexItem {
  id: string;
  url: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  date: string;
  minutes: number;
  cover: string;
  hay: string;
}

export interface Hit {
  url: string;
  title: string;
  /** HTML-safe excerpt (may contain <mark>) */
  excerpt: string;
  category: string;
  minutes: number;
  date: string;
  score: number;
  sub?: { title: string; url: string }[];
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function terms(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Score an item: every term must match; title hits weigh most, word starts more than infixes. */
export function scoreItem(item: IndexItem, ts: string[]): number {
  if (!ts.length) return 0;
  const title = fold(item.title);
  const tags = fold(item.tags.join(' '));
  let score = 0;
  for (const t of ts) {
    if (!item.hay.includes(t)) return 0;
    const wordStart = new RegExp(`(^|[^a-z0-9])${t}`);
    if (wordStart.test(title)) score += 10;
    else if (title.includes(t)) score += 6;
    if (wordStart.test(tags)) score += 4;
    score += 1;
  }
  if (title.startsWith(ts.join(' '))) score += 8;
  return score;
}

export function instantSearch(index: IndexItem[], query: string, category = 'all', limit = 8): Hit[] {
  const ts = terms(query);
  return index
    .filter((i) => category === 'all' || i.category === category)
    .map((i) => ({ i, s: scoreItem(i, ts) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || b.i.date.localeCompare(a.i.date))
    .slice(0, limit)
    .map(({ i, s }) => ({
      url: i.url,
      title: i.title,
      excerpt: highlight(i.description, ts),
      category: i.category,
      minutes: i.minutes,
      date: i.date,
      score: s,
    }));
}

/** Wrap accent-insensitive matches of `ts` in <mark>, escaping everything else. */
export function highlight(text: string, ts: string[]): string {
  if (!ts.length) return escapeHtml(text);
  const folded = fold(text);
  // fold() keeps a 1:1 character mapping for Vietnamese (NFC), so indices line up.
  const marks: [number, number][] = [];
  for (const t of ts) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      marks.push([i, i + t.length]);
      i = folded.indexOf(t, i + t.length);
    }
  }
  if (!marks.length || folded.length !== text.length) return escapeHtml(text);
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [a, b] of marks) {
    if (a < pos) continue;
    out += escapeHtml(text.slice(pos, a)) + '<mark>' + escapeHtml(text.slice(a, b)) + '</mark>';
    pos = b;
  }
  return out + escapeHtml(text.slice(pos));
}

/** Merge instant hits with full-text hits (dedupe by URL, keep the best score, prefer richer excerpts). */
export function mergeHits(instant: Hit[], full: Hit[], limit = 10): Hit[] {
  const map = new Map<string, Hit>();
  for (const h of [...instant, ...full]) {
    const prev = map.get(h.url);
    if (!prev) map.set(h.url, h);
    else
      map.set(h.url, {
        ...prev,
        score: Math.max(prev.score, h.score) + 2,
        excerpt: h.excerpt.includes('<mark>') && !prev.excerpt.includes('<mark>') ? h.excerpt : prev.excerpt,
        sub: prev.sub ?? h.sub,
      });
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
