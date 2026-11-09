/**
 * Reading the user's text selection inside the article and turning it into a quote + text-fragment link.
 * DOM-only helpers (no UI); see SelectionShare.astro for the toolbar.
 */
import { buildTextFragment, countOccurrences, normalizeText } from './text-fragment';

/** Selections touching these are ignored (code is copied, not quoted). */
export const NO_SHARE = 'pre, code, kbd, samp, .expressive-code, button, input, textarea, [data-no-share]';
const BLOCK = 'p, li, h2, h3, h4, blockquote, figcaption, td, th, dt, dd';
const WORD = /[\p{L}\p{N}\p{M}]/u;

export interface SelectionInfo {
  /** The selected text, one entry per block. */
  parts: string[];
  /** Human quote: parts joined with line breaks. */
  quote: string;
  /** `#:~:text=…` for this selection. */
  hash: string;
  range: Range;
}

export function countWords(s: string): number {
  return normalizeText(s)
    .split(' ')
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const elementOf = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement);

/** Grow a range so it doesn't start or end in the middle of a word (text fragments match whole words). */
export function expandToWords(range: Range): Range {
  const r = range.cloneRange();
  const s = r.startContainer;
  if (s.nodeType === 3) {
    const t = (s as Text).data;
    let i = r.startOffset;
    if (i < t.length && WORD.test(t[i])) while (i > 0 && WORD.test(t[i - 1])) i--;
    r.setStart(s, i);
  }
  const e = r.endContainer;
  if (e.nodeType === 3) {
    const t = (e as Text).data;
    let i = r.endOffset;
    if (i > 0 && WORD.test(t[i - 1])) while (i < t.length && WORD.test(t[i])) i++;
    r.setEnd(e, i);
  }
  return r;
}

/** Top-level text blocks of `root` that the range touches, each clipped to the range. */
function selectedParts(range: Range, root: Element): string[] {
  const doc = root.ownerDocument;
  const blocks = [...root.querySelectorAll(BLOCK)].filter(
    (b) => !b.parentElement?.closest(BLOCK) && range.intersectsNode(b) && !b.closest(NO_SHARE),
  );
  if (!blocks.length) return [range.toString()];
  return blocks.map((b) => {
    const r = doc.createRange();
    r.selectNodeContents(b);
    if (b.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
    if (b.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
    return r.toString();
  });
}

function blockOf(node: Node, root: Element): Element {
  return elementOf(node)?.closest(BLOCK) ?? root;
}
/** Up to `n` words right before / after the range, inside the same block (for prefix-/-suffix). */
function contextWords(range: Range, root: Element, side: 'before' | 'after', n = 3): string {
  const doc = root.ownerDocument;
  const r = doc.createRange();
  if (side === 'before') {
    r.selectNodeContents(blockOf(range.startContainer, root));
    r.setEnd(range.startContainer, range.startOffset);
    return normalizeText(r.toString()).split(' ').filter(Boolean).slice(-n).join(' ');
  }
  r.selectNodeContents(blockOf(range.endContainer, root));
  r.setStart(range.endContainer, range.endOffset);
  return normalizeText(r.toString()).split(' ').filter(Boolean).slice(0, n).join(' ');
}

/**
 * Returns share info when the current selection is ≥ `minWords` words inside `root` and not in code; otherwise null.
 */
export function readSelection(root: Element, sel: Selection | null, minWords = 3): SelectionInfo | null {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const raw = sel.getRangeAt(0);
  if (!root.contains(raw.commonAncestorContainer)) return null;
  const startEl = elementOf(raw.startContainer);
  const endEl = elementOf(raw.endContainer);
  if (startEl?.closest(NO_SHARE) || endEl?.closest(NO_SHARE)) return null;

  const range = expandToWords(raw);
  const parts = selectedParts(range, root)
    .map(normalizeText)
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (!parts.length || countWords(parts.join(' ')) < minWords) return null;

  // Disambiguate when the start of the quote appears more than once in the article.
  let hash = buildTextFragment(parts.join('\n'));
  const firstTerm = decodeURIComponent(hash.replace('#:~:text=', '').split(',')[0]);
  if (countOccurrences(root.textContent ?? '', firstTerm) > 1) {
    const prefix = contextWords(range, root, 'before');
    const suffix = prefix ? '' : contextWords(range, root, 'after');
    hash = buildTextFragment(parts.join('\n'), { prefix, suffix });
  }
  return { parts, quote: parts.join('\n'), hash, range };
}
