/**
 * Bindings + variables of the "nhip-so" Worker (see wrangler.jsonc).
 *
 * Hand-written on purpose instead of committing the output of `wrangler types`: optional bindings
 * (RL_WRITE) and optional secrets are expressed precisely here, and type-checking the Worker does
 * not require running wrangler first. Runtime types come from @cloudflare/workers-types.
 */
export interface Env {
  /** Static build in ./dist (Workers Static Assets). */
  ASSETS: Fetcher;
  /** D1 database "blog-db" — schema in migrations/. */
  DB?: D1Database;
  /** Optional rate limiter for POST endpoints (20 requests / 60 s per IP and endpoint). */
  RL_WRITE?: RateLimit;
  /** Secret salt for the anonymous visitor hash. Set with `npx wrangler secret put HASH_SALT`. */
  HASH_SALT?: string;
  /** Cloudflare Turnstile secret. When set, /api/subscribe requires a valid token. */
  TURNSTILE_SECRET?: string;
  /** Extra origins allowed to POST, comma-separated (e.g. "http://localhost:4321" for `astro dev`). */
  ALLOWED_ORIGINS?: string;
}
