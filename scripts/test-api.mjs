#!/usr/bin/env node
/**
 * End-to-end check of the Worker API (views, reactions, newsletter) against a running server.
 *
 *   npm run build && npx wrangler d1 migrations apply blog-db --local
 *   npx wrangler dev --port 8787          # in another terminal (or: npm run preview)
 *   node scripts/test-api.mjs http://localhost:8787 [--burst]
 *
 * --burst  also fires 25 quick writes to check the RL_WRITE rate limiter (uses up the 60 s budget,
 *          so run it last). Uses the article /bai-viet/llm-hoat-dong-the-nao/ (override: TEST_SLUG=<slug>).
 * Only uses Node 22+ built-ins (fetch). Exit code 1 if any check fails.
 */

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || 'http://localhost:8787').replace(/\/+$/, '');
const burst = args.includes('--burst');
const SLUG = process.env.TEST_SLUG || 'llm-hoat-dong-the-nao';
const run = Date.now().toString(36);
const KINDS = ['like', 'love', 'fire', 'mindblown', 'clap'];

let failed = 0;
let passed = 0;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ${green('✓')} ${name}`);
  } else {
    failed++;
    console.log(`  ${red('✗')} ${name}${detail ? dim(`  — ${detail}`) : ''}`);
  }
}

async function call(path, { method = 'GET', body, origin = base, ua = `test-api/${run}`, type = 'application/json', raw } = {}) {
  const headers = { 'user-agent': ua };
  if (origin) headers.origin = origin;
  if (body !== undefined || raw !== undefined) headers['content-type'] = type;
  const res = await fetch(base + path, {
    method,
    headers,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, data, text };
}

const isStats = (d, slug) =>
  d && d.slug === slug && Number.isInteger(d.views) && d.reactions && KINDS.every((k) => Number.isInteger(d.reactions[k]));

async function main() {
  console.log(`API test → ${base}  (run ${run})\n`);

  console.log('Health & static assets');
  let r = await call('/api/health');
  check('GET /api/health → 200 { ok, db }', r.status === 200 && r.data?.ok === true && r.data?.db === true, r.text);
  check('API responses are JSON + nosniff', /application\/json/.test(r.headers.get('content-type') || '') && r.headers.get('x-content-type-options') === 'nosniff');
  r = await call(`/bai-viet/${SLUG}/`);
  check(`GET /bai-viet/${SLUG}/ → 200 HTML (static assets)`, r.status === 200 && /<html/i.test(r.text), `status ${r.status}`);
  r = await call('/khong-co-trang-nay/');
  check('unknown page → 404 page', r.status === 404, `status ${r.status}`);
  r = await call('/api/khong-co');
  check('unknown /api route → 404 JSON', r.status === 404 && r.data?.ok === false, r.text);

  console.log('\nGET /api/stats');
  r = await call(`/api/stats?slug=${SLUG}`);
  check('single slug → Stats shape', r.status === 200 && isStats(r.data, SLUG), r.text);
  check('stats are cacheable for 30 s', /max-age=30/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
  const before = r.data;
  r = await call(`/api/stats?slugs=${SLUG},bai-chua-co`);
  check('batch → { stats: { slug: Stats } } incl. zeros for unknown', r.status === 200 && isStats(r.data?.stats?.[SLUG], SLUG) && r.data?.stats?.['bai-chua-co']?.views === 0, r.text);
  r = await call(`/api/stats?slugs=${Array.from({ length: 51 }, (_, i) => `s${i}`).join(',')}`);
  check('batch of 51 slugs → 400', r.status === 400 && typeof r.data?.error === 'string', `status ${r.status}`);
  r = await call('/api/stats?slug=Bad%20Slug!');
  check('malformed slug → 400 with Vietnamese error', r.status === 400 && typeof r.data?.error === 'string', r.text);
  r = await call('/api/stats');
  check('no slug → 400', r.status === 400, `status ${r.status}`);

  console.log('\nPOST /api/view');
  const uaA = `test-api/${run}/A`;
  r = await call('/api/view', { method: 'POST', body: { slug: SLUG }, ua: uaA });
  check('first view → counted, views +1', r.status === 200 && r.data?.counted === true && r.data?.views === before.views + 1, r.text);
  r = await call('/api/view', { method: 'POST', body: { slug: SLUG }, ua: uaA });
  check('same reader again → not counted (dedupe)', r.status === 200 && r.data?.counted === false && r.data?.views === before.views + 1, r.text);
  r = await call('/api/view', { method: 'POST', body: { slug: SLUG }, ua: `test-api/${run}/B` });
  check('another reader → counted', r.status === 200 && r.data?.counted === true && r.data?.views === before.views + 2, r.text);
  check('write responses are not cached', r.headers.get('cache-control') === 'no-store', r.headers.get('cache-control'));
  r = await call('/api/view', { method: 'POST', body: { slug: 'bai-khong-ton-tai' } });
  check('slug without an article → 400', r.status === 400 && typeof r.data?.error === 'string', r.text);
  r = await call('/api/view', { method: 'POST', body: { slug: '../../etc/passwd' } });
  check('path-traversal slug → 400', r.status === 400, `status ${r.status}`);
  r = await call('/api/view', { method: 'POST', body: { slug: SLUG }, origin: 'https://evil.example' });
  check('cross-origin POST → 403', r.status === 403 && typeof r.data?.error === 'string', r.text);
  r = await call('/api/view', { method: 'POST', body: { slug: SLUG }, origin: null });
  check('POST without Origin → 403', r.status === 403, `status ${r.status}`);
  r = await call('/api/view', { method: 'POST', raw: JSON.stringify({ slug: SLUG }), type: 'text/plain' });
  check('non-JSON content type → 415', r.status === 415, `status ${r.status}`);
  r = await call('/api/view', { method: 'POST', raw: '{oops' });
  check('broken JSON → 400', r.status === 400, `status ${r.status}`);
  r = await call('/api/view', { method: 'POST', raw: JSON.stringify({ slug: 'x'.repeat(3000) }) });
  check('oversized body → 413', r.status === 413, `status ${r.status}`);
  r = await call('/api/view');
  check('GET /api/view → 405', r.status === 405, `status ${r.status}`);

  console.log('\nPOST /api/react');
  const uaR = `test-api/${run}/R`;
  r = await call(`/api/stats?slug=${SLUG}&_=${run}`);
  const loveBefore = r.data?.reactions?.love ?? 0;
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'love' }, ua: uaR });
  check('react love → counted, +1', r.status === 200 && r.data?.counted === true && r.data?.reactions?.love === loveBefore + 1, r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'love' }, ua: uaR });
  check('same reaction again → not counted', r.data?.counted === false && r.data?.reactions?.love === loveBefore + 1, r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'fire' }, ua: uaR });
  check('different kind → counted', r.data?.counted === true && isStats(r.data, SLUG), r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'love', undo: true }, ua: uaR });
  check('undo (same reader, same day) → -1', r.data?.counted === true && r.data?.reactions?.love === loveBefore, r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'love', undo: true }, ua: uaR });
  check('undo twice → no-op', r.data?.counted === false && r.data?.reactions?.love === loveBefore, r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'love', undo: true }, ua: `test-api/${run}/stranger` });
  check("undo by someone who never reacted → no-op (can't drain counts)", r.data?.counted === false && r.data?.reactions?.love === loveBefore, r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'angry' } });
  check('unknown kind → 400', r.status === 400 && typeof r.data?.error === 'string', r.text);
  r = await call('/api/react', { method: 'POST', body: { slug: SLUG, kind: 'love' }, origin: 'https://evil.example' });
  check('cross-origin react → 403', r.status === 403, `status ${r.status}`);

  console.log('\nPOST /api/subscribe');
  const email = `test+${run}@example.com`;
  r = await call('/api/subscribe', { method: 'POST', body: { email, website: 'http://spam.example' } });
  check('honeypot filled → fake success', r.status === 200 && r.data?.ok === true, r.text);
  r = await call('/api/subscribe', { method: 'POST', body: { email, website: '' } });
  check("new email → subscribed (honeypot call didn't store it)", r.status === 200 && r.data?.ok === true && r.data?.status === 'subscribed', r.text);
  r = await call('/api/subscribe', { method: 'POST', body: { email: `  ${email.toUpperCase()} `, website: '' } });
  check('same email (case/space differ) → exists (idempotent)', r.status === 200 && r.data?.ok === true && r.data?.status === 'exists', r.text);
  for (const bad of ['khong-phai-email', 'a@b', 'a b@c.com', 'x@y..com', '']) {
    r = await call('/api/subscribe', { method: 'POST', body: { email: bad, website: '' } });
    check(`invalid email ${JSON.stringify(bad)} → 400 { ok:false, error }`, r.status === 400 && r.data?.ok === false && typeof r.data?.error === 'string', r.text);
  }
  r = await call('/api/subscribe', { method: 'POST', body: { email, website: '' }, origin: 'https://evil.example' });
  check('cross-origin subscribe → 403', r.status === 403, `status ${r.status}`);

  if (burst) {
    console.log('\nRate limit (RL_WRITE: 20 / 60 s per IP + endpoint)');
    const codes = [];
    for (let i = 0; i < 25; i++) {
      codes.push((await call('/api/view', { method: 'POST', body: { slug: SLUG }, ua: `test-api/${run}/burst` })).status);
    }
    const limited = codes.filter((c) => c === 429).length;
    check(`25 quick writes → some 429 (${limited} limited)`, limited > 0, codes.join(','));
  }

  console.log(`\n${passed} passed, ${failed ? red(`${failed} failed`) : green('0 failed')}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(red(`\nCannot reach ${base}: ${err.message}`));
  console.error('Start it first: npm run build && npx wrangler d1 migrations apply blog-db --local && npx wrangler dev --port 8787');
  process.exitCode = 1;
});
