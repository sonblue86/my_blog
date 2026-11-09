/**
 * Worker "nhip-so": the static site is served by Workers Static Assets; only /api/* reaches this code
 * (assets.run_worker_first in wrangler.jsonc). Endpoints and response shapes: worker/shared.ts.
 *
 * Privacy: no cookies, no IPs stored. A reader is an anonymous daily hash (see lib.ts → visitorId).
 * Cost: a duplicate view/reaction is an ignored INSERT (0 rows written); a counted one writes 2 rows.
 */
import type { Env } from './env';
import {
  MAX_BATCH,
  emptyStats,
  isReactionKind,
  isValidEmail,
  isValidSlug,
  normalizeEmail,
  type ReactionKind,
  type Stats,
  type SubscribeResult,
  type WriteResult,
} from './shared';
import {
  HttpError,
  MESSAGES,
  TtlCache,
  clientIp,
  dayKey,
  errorResponse,
  isAllowedOrigin,
  json,
  readJsonBody,
  visitorId,
} from './lib';

type Ctx = { request: Request; env: Env; url: URL; db: D1Database };

const STATS_CACHE = 'public, max-age=30';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    // Safety net: with run_worker_first: ['/api/*'] other paths never get here.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.message);
      console.error('api error', url.pathname, err);
      return errorResponse(500, MESSAGES.server);
    }
  },

  /** Cron (wrangler.jsonc → triggers.crons): drop de-duplication rows older than yesterday. */
  async scheduled(_controller, env, ctx): Promise<void> {
    if (!env.DB) return;
    const cutoff = dayKey(Date.now() - 86_400_000);
    ctx.waitUntil(
      env.DB.prepare('DELETE FROM dedupe WHERE day < ?1')
        .bind(cutoff)
        .run()
        .then((r) => console.log(`dedupe purge < ${cutoff}: ${r.meta.changes} rows`)),
    );
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  if (path === '/api/health') {
    if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed('GET, HEAD');
    return json({ ok: true, db: Boolean(env.DB) });
  }

  const handlers: Record<string, { method: 'GET' | 'POST'; run: (c: Ctx) => Promise<Response> }> = {
    '/api/stats': { method: 'GET', run: handleStats },
    '/api/view': { method: 'POST', run: handleView },
    '/api/react': { method: 'POST', run: handleReact },
    '/api/subscribe': { method: 'POST', run: handleSubscribe },
  };
  const handler = handlers[path];
  if (!handler) return errorResponse(404, MESSAGES.notFound);

  // Same-origin only: no CORS headers are ever sent, so a cross-origin preflight simply fails.
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: handler.method } });
  if (method !== handler.method && !(handler.method === 'GET' && method === 'HEAD')) {
    return methodNotAllowed(handler.method);
  }
  if (handler.method === 'POST' && !isAllowedOrigin(request.headers.get('origin'), url.origin, env.ALLOWED_ORIGINS)) {
    return errorResponse(403, MESSAGES.badOrigin);
  }
  if (!env.DB) return errorResponse(503, MESSAGES.disabled);

  return handler.run({ request, env, url, db: env.DB });
}

function methodNotAllowed(allow: string) {
  return errorResponse(405, MESSAGES.method, { allow });
}

/* ------------------------------------------------------------------ stats */

function statsQueries(db: D1Database, slugs: string[]) {
  const ph = slugs.map((_, i) => `?${i + 1}`).join(', ');
  return [
    db.prepare(`SELECT slug, views FROM page_views WHERE slug IN (${ph})`).bind(...slugs),
    db.prepare(`SELECT slug, kind, count FROM reactions WHERE slug IN (${ph})`).bind(...slugs),
  ];
}

function collectStats(slugs: string[], results: D1Result[]): Record<string, Stats> {
  const out: Record<string, Stats> = {};
  for (const s of slugs) out[s] = emptyStats(s);
  for (const row of (results[0]?.results ?? []) as { slug: string; views: number }[]) {
    const s = out[row.slug];
    if (s) s.views = Number(row.views) || 0;
  }
  for (const row of (results[1]?.results ?? []) as { slug: string; kind: string; count: number }[]) {
    const s = out[row.slug];
    if (s && isReactionKind(row.kind)) s.reactions[row.kind] = Math.max(0, Number(row.count) || 0);
  }
  return out;
}

async function handleStats({ db, url }: Ctx): Promise<Response> {
  const single = url.searchParams.get('slug');
  const many = url.searchParams.get('slugs');

  if (single !== null) {
    if (!isValidSlug(single)) throw new HttpError(400, MESSAGES.badSlug);
    const res = await db.batch(statsQueries(db, [single]));
    return json(collectStats([single], res)[single], { cache: STATS_CACHE });
  }

  if (many !== null) {
    const slugs = [...new Set(many.split(',').map((s) => s.trim()).filter(Boolean))];
    if (slugs.length === 0 || slugs.length > MAX_BATCH || !slugs.every(isValidSlug)) {
      throw new HttpError(400, MESSAGES.badSlug);
    }
    const res = await db.batch(statsQueries(db, slugs));
    return json({ stats: collectStats(slugs, res) }, { cache: STATS_CACHE });
  }

  throw new HttpError(400, MESSAGES.badSlug);
}

/* ------------------------------------------------------------ write guards */

const postExists = new TtlCache<boolean>(1000);

/** Only real articles can be counted: HEAD /bai-viet/<slug>/ against the static build. */
async function assertPost({ env, url }: Ctx, slug: unknown): Promise<string> {
  if (!isValidSlug(slug)) throw new HttpError(400, MESSAGES.badSlug);
  let ok = postExists.get(slug);
  if (ok === undefined) {
    const res = await env.ASSETS.fetch(new Request(new URL(`/bai-viet/${slug}/`, url.origin), { method: 'HEAD' }));
    ok = res.status === 200;
    postExists.set(slug, ok, ok ? 10 * 60_000 : 60_000);
  }
  if (!ok) throw new HttpError(400, MESSAGES.badSlug);
  return slug;
}

async function rateLimit({ env, request }: Ctx, bucket: string) {
  if (!env.RL_WRITE) return;
  let success = true;
  try {
    ({ success } = await env.RL_WRITE.limit({ key: `${bucket}:${clientIp(request)}` }));
  } catch (err) {
    console.warn('rate limiter unavailable', err); // fail open: counting is not worth an outage
  }
  if (!success) throw new HttpError(429, MESSAGES.tooMany);
}

async function reader({ request, env }: Ctx) {
  const day = dayKey();
  const visitor = await visitorId(day, clientIp(request), request.headers.get('user-agent') || '', env.HASH_SALT);
  return { day, visitor };
}

/* ------------------------------------------------------------- view/react */

async function handleView(c: Ctx): Promise<Response> {
  const body = await readJsonBody(c.request);
  await rateLimit(c, 'view');
  const slug = await assertPost(c, body.slug);
  const { day, visitor } = await reader(c);

  const [insert, ...stats] = await c.db.batch([
    c.db.prepare('INSERT OR IGNORE INTO dedupe (day, visitor, slug, action) VALUES (?1, ?2, ?3, ?4)').bind(day, visitor, slug, 'view'),
    ...statsQueries(c.db, [slug]),
  ]);
  const result: WriteResult = { ...collectStats([slug], stats)[slug]!, counted: (insert?.meta.changes ?? 0) > 0 };
  return json(result);
}

async function handleReact(c: Ctx): Promise<Response> {
  const body = await readJsonBody(c.request);
  await rateLimit(c, 'react');
  if (!isReactionKind(body.kind)) throw new HttpError(400, MESSAGES.badKind);
  const kind: ReactionKind = body.kind;
  const slug = await assertPost(c, body.slug);
  const { day, visitor } = await reader(c);
  const action = `react:${kind}`;

  // Undo only works for a reaction made today by the same reader (the dedupe row proves it);
  // otherwise it is a no-op, so nobody can drain someone else's counts.
  const write = body.undo === true
    ? [
        c.db
          .prepare(
            `UPDATE reactions SET count = MAX(count - 1, 0)
             WHERE slug = ?1 AND kind = ?2
               AND EXISTS (SELECT 1 FROM dedupe WHERE day = ?3 AND visitor = ?4 AND slug = ?1 AND action = ?5)`,
          )
          .bind(slug, kind, day, visitor, action),
        c.db.prepare('DELETE FROM dedupe WHERE day = ?1 AND visitor = ?2 AND slug = ?3 AND action = ?4').bind(day, visitor, slug, action),
      ]
    : [c.db.prepare('INSERT OR IGNORE INTO dedupe (day, visitor, slug, action) VALUES (?1, ?2, ?3, ?4)').bind(day, visitor, slug, action)];

  const results = await c.db.batch([...write, ...statsQueries(c.db, [slug])]);
  const counted = (results[0]?.meta.changes ?? 0) > 0;
  const result: WriteResult = { ...collectStats([slug], results.slice(write.length))[slug]!, counted };
  return json(result);
}

/* --------------------------------------------------------------- newsletter */

async function verifyTurnstile(secret: string, token: unknown, ip: string): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip && ip !== '0.0.0.0') form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.warn('turnstile verify failed', err);
    return false;
  }
}

async function handleSubscribe(c: Ctx): Promise<Response> {
  const body = await readJsonBody(c.request);

  // Honeypot: humans never see the "website" field. Pretend success so bots learn nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true, status: 'subscribed' } satisfies SubscribeResult);
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return json({ ok: false, error: MESSAGES.badEmail } satisfies SubscribeResult, { status: 400 });

  await rateLimit(c, 'subscribe');

  if (c.env.TURNSTILE_SECRET && !(await verifyTurnstile(c.env.TURNSTILE_SECRET, body.token, clientIp(c.request)))) {
    return json({ ok: false, error: MESSAGES.captcha } satisfies SubscribeResult, { status: 400 });
  }

  const source = typeof body.source === 'string' ? body.source.slice(0, 64) : null;
  const res = await c.db
    .prepare(
      `INSERT INTO subscribers (email, status, source, created_at) VALUES (?1, 'active', ?2, ?3)
       ON CONFLICT (email) DO UPDATE SET status = 'active' WHERE subscribers.status <> 'active'`,
    )
    .bind(email, source, new Date().toISOString())
    .run();

  const status = (res.meta.changes ?? 0) > 0 ? 'subscribed' : 'exists';
  return json({ ok: true, status } satisfies SubscribeResult);
}
