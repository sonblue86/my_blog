/**
 * API contract shared by the Worker (worker/index.ts) and the browser client (src/scripts/api.ts).
 * Pure TypeScript only — no DOM or Workers globals — so both tsconfigs accept it.
 *
 *   GET  /api/health                      -> { ok: true }
 *   GET  /api/stats?slug=a                -> Stats
 *   GET  /api/stats?slugs=a,b (<= 50)     -> { stats: Record<slug, Stats> }
 *   POST /api/view      { slug }                  -> Stats & { counted }
 *   POST /api/react     { slug, kind, undo? }     -> Stats & { counted }
 *   POST /api/subscribe { email, website, token?, source? }
 *                       -> { ok: true, status: 'subscribed' | 'exists' } | { ok: false, error }
 *   Errors: HTTP 4xx/5xx with { ok: false, error: '<tiếng Việt>' }
 */

export const REACTION_KINDS = ['like', 'love', 'fire', 'mindblown', 'clap'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export interface Stats {
  slug: string;
  views: number;
  reactions: Record<ReactionKind, number>;
}

export interface WriteResult extends Stats {
  /** false when the action was a duplicate (same reader, same day) and did not change any counter. */
  counted: boolean;
}

export type SubscribeResult = { ok: true; status: 'subscribed' | 'exists' } | { ok: false; error: string };

/** Max slugs per GET /api/stats?slugs= request. */
export const MAX_BATCH = 50;

/** Post ids are lowercase ASCII words joined by "-" (optionally nested with "/"), like the URLs. */
const SLUG_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\/[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/;

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 120 && SLUG_RE.test(value);
}

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === 'string' && (REACTION_KINDS as readonly string[]).includes(value);
}

export function emptyReactions(): Record<ReactionKind, number> {
  return { like: 0, love: 0, fire: 0, mindblown: 0, clap: 0 };
}

export function emptyStats(slug: string): Stats {
  return { slug, views: 0, reactions: emptyReactions() };
}

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Pragmatic email check: one "@", a dot in the domain, no spaces, sane lengths (RFC 5321 limits).
 * Deliberately not a full RFC 5322 parser — the goal is catching typos, not rejecting real addresses.
 */
const EMAIL_RE = /^[^\s@"<>(),;:\\[\]]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 254) return false;
  const at = value.lastIndexOf('@');
  if (at < 1 || at > 64) return false;
  if (value.includes('..')) return false;
  return EMAIL_RE.test(value);
}
