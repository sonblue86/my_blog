/**
 * Text-fragment links (`#:~:text=…`) — pure helpers, no DOM access, unit-tested.
 *
 * Browsers strip the text directive from `location.href`, so we build it ourselves from the
 * selected text. Spec: https://wicg.github.io/scroll-to-text-fragment/
 *  - each term is percent-encoded; '-' , ',' and '&' are syntax characters and must be escaped
 *  - `textStart,textEnd` match from the start of one block to the end of another (or the same) block
 *  - optional `prefix-,` / `,-suffix` disambiguate a match that occurs several times on the page
 */

export interface FragmentOptions {
  /** Words immediately before the selection (same block) — used when the match is ambiguous. */
  prefix?: string;
  /** Words immediately after the selection (same block). */
  suffix?: string;
  /** A single-block selection up to this many words is encoded verbatim. */
  maxWords?: number;
  /** Words kept for textStart / textEnd when the selection is long or spans several blocks. */
  edgeWords?: number;
}

/** Collapse whitespace (incl. NBSP), trim and normalise to NFC. */
export function normalizeText(s: string): string {
  return s.replace(/[\s ]+/g, ' ').trim().normalize('NFC');
}

/** Percent-encode one term of a text directive. */
export function encodeFragmentTerm(s: string): string {
  return encodeURIComponent(normalizeText(s)).replace(/-/g, '%2D');
}

const words = (s: string) => normalizeText(s).split(' ').filter(Boolean);

/**
 * Build the `#:~:text=` hash for a selection. `selected` is `Selection.toString()`: blocks are
 * separated by newlines. Returns '' when there is nothing usable.
 */
export function buildTextFragment(selected: string, opts: FragmentOptions = {}): string {
  const { maxWords = 10, edgeWords = 4 } = opts;
  const blocks = selected
    .split(/\n+/)
    .map(normalizeText)
    .filter((b) => /[\p{L}\p{N}]/u.test(b));
  if (!blocks.length) return '';

  const first = words(blocks[0]);
  const last = words(blocks[blocks.length - 1]);
  let directive: string;
  if (blocks.length === 1 && first.length <= maxWords) {
    directive = encodeFragmentTerm(blocks[0]);
  } else {
    // textStart and textEnd must each sit inside ONE block → take them from the first/last block.
    const start = first.slice(0, edgeWords).join(' ');
    const end = last.slice(-edgeWords).join(' ');
    directive = `${encodeFragmentTerm(start)},${encodeFragmentTerm(end)}`;
  }

  const prefix = opts.prefix ? words(opts.prefix).slice(-3).join(' ') : '';
  const suffix = opts.suffix ? words(opts.suffix).slice(0, 3).join(' ') : '';
  if (prefix) directive = `${encodeFragmentTerm(prefix)}-,${directive}`;
  if (suffix) directive = `${directive},-${encodeFragmentTerm(suffix)}`;
  return `#:~:text=${directive}`;
}

/** Replace any existing hash on `href` with the text directive. */
export function withTextFragment(href: string, hash: string): string {
  const base = href.split('#')[0];
  return hash ? base + hash : base;
}

/** Count non-overlapping occurrences of `needle` in `haystack` (both normalised, case-insensitive). */
export function countOccurrences(haystack: string, needle: string): number {
  const h = normalizeText(haystack).toLocaleLowerCase('vi');
  const n = normalizeText(needle).toLocaleLowerCase('vi');
  if (!n) return 0;
  let count = 0;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + n.length)) count++;
  return count;
}

/** Shorten a quote for share intents (keeps whole words, adds an ellipsis). */
export function truncateQuote(s: string, max = 200): string {
  const t = normalizeText(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/u, '')}…`;
}
