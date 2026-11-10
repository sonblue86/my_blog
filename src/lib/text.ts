/**
 * Text helpers that know about Vietnamese.
 * Pure functions — safe to import from build-time code, client scripts and tests.
 */

/** "Đây là Tiêu đề!" -> "day-la-tieu-de" (bỏ dấu, đ -> d, ký tự lạ -> "-"). */
export function slugify(input: string): string {
  const slug = input
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `t-${shortHash(input)}`; // e.g. a tag written only in emoji or CJK
}

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Vietnamese reading speed, measured in space-separated syllables per minute. */
export const WORDS_PER_MINUTE = 260;

/** Strip Markdown/MDX syntax so we only count words a reader actually reads. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^---[\s\S]*?---/, ' ') // frontmatter
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/^\s*(import|export)\s.*$/gm, ' ') // MDX import/export
    .replace(/<[^>]+>/g, ' ') // JSX / HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/[#>*_~|=-]+/g, ' ');
}

export function countWords(md: string): number {
  const text = stripMarkdown(md).trim();
  if (!text) return 0;
  return text.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Minutes to read, never less than 1. Code blocks add a little time. */
export function readingTime(md: string): { minutes: number; words: number } {
  const words = countWords(md);
  const codeBlocks = (md.match(/```/g)?.length ?? 0) / 2;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE + codeBlocks * 0.3));
  return { minutes, words };
}

/** Remove diacritics for accent-insensitive comparisons ("Tiếng Việt" ~ "tieng viet"). */
export function fold(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
