/**
 * "Xem trước" for the writing studio: renders the Markdown body roughly the way the blog will.
 * Raw HTML in the Markdown is NOT rendered here (html: false), so pasted or AI-written markup can
 * never run in the studio, where the GitHub token lives.
 */
import MarkdownIt from 'markdown-it';
import { renderBlock } from '../lib/blocks';
import { normalizeRel } from './post-file';

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

// External links open in a new tab, like on the blog.
const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx]!.attrGet('href') ?? '');
  if (/^https?:\/\//i.test(href)) {
    tokens[idx]!.attrSet('target', '_blank');
    tokens[idx]!.attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const src = String(token.attrGet('src') ?? '');
  const images = (env as { images?: Record<string, string> }).images ?? {};
  if (!/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src)) token.attrSet('src', images[normalizeRel(src)] ?? '');
  token.attrSet('loading', 'lazy');
  return defaultImage(tokens, idx, options, env, self);
};

// "Khối nội dung" fences render exactly as on the blog (the renderer escapes everything itself).
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const block = renderBlock(token.info.trim().split(/\s+/)[0], token.content);
  return block ?? defaultFence(tokens, idx, options, env, self);
};

/** @param images relative image name → displayable URL (already resolved by the caller). */
export function renderMarkdown(body: string, images: Record<string, string> = {}): string {
  return md.render(body, { images });
}

/** Same rule of thumb as the blog: ~220 words per minute, at least 1 minute. */
export function readingMinutes(body: string): number {
  const words = body.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function wordCount(body: string): number {
  return body.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
