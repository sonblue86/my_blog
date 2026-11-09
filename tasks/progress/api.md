# Progress — feat/api (Cloudflare backend + community widgets)

## Done
- wrangler.jsonc (assets run_worker_first /api/*, D1 DB, RL_WRITE 20/60, cron 17 3 * * *, observability)
- migrations/0001_init.sql (page_views, reactions, dedupe WITHOUT ROWID + AFTER INSERT triggers, subscribers)
- worker/ (index.ts, lib.ts, shared.ts, env.ts, tsconfig.json) — `npx tsc -p worker/tsconfig.json` OK
- scripts/test-api.mjs — 41/41 pass vs `wrangler dev --port 8790` (incl. --burst → 429)
- cron purge verified via local explorer: old dedupe row deleted, counters untouched
- .dev.vars.example

- src/scripts/api.ts + tests; ViewCount, Reactions, Comments (giscus), Analytics, Newsletter (Turnstile) — all committed
- Branch fast-forwarded to integrated main (all agents' work present)

- Browser check on /bai-viet/llm-hoat-dong-the-nao/ vs wrangler dev :8792 (390x844 + 1440x900, light + dark):
  ViewCount POST fires at ~10.3 s visible, once per tab (server dedupes same reader/day); Reactions optimistic +
  persisted after reload + undo; Newsletter card & footer invalid / success / exists; targets ≥44px, no x-overflow.
  Comments: prod renders nothing with empty GISCUS, dev shows dashed hint.
  astro preview (no API): 0 layout shifts at both widths (after fix), 0 JS errors; widgets hidden; only console
  entry is the browser's network log for the single 404 GET /api/stats per tab (then cached 2 min).
  Fixes: Newsletter invalid state never cleared on typing; ViewCount collapsed on failure → CLS 0.014 on mobile.
- scripts/test-api.mjs → 41/41 (incl. --burst) vs :8792; default slug now llm-hoat-dong-the-nao, port 8787.
- docs/CLOUDFLARE.md (Vietnamese, beginner, 19 sections; anchors/links verified by script; export commands tested locally in bash + PowerShell 5.1)

## Next
1. Final: tsc worker, vitest, astro check

## Integration notes (files I don't own)
- PostLayout: `<section class="container-page mt-20">` around `<Comments />` stays (empty, +80px gap) when GISCUS
  is not configured → wrap with `GISCUS.repo && GISCUS.repoId && GISCUS.categoryId`.
- ActionBar rail link `href="#binh-luan"` ("Tới phần bình luận") + Shortcuts `c` point to nothing in prod when
  GISCUS is empty → render/enable only under the same condition.

## Notes
- PostLayout renders `<Comments />` without props → Comments uses pathname mapping; no slug needed.
- Decision: worker Env is hand-written (worker/env.ts); `wrangler types` output NOT committed → integrator should
  gitignore `worker-configuration.d.ts` and change/remove `cf-typegen` script (root file would break astro check).
- Local run: `.dev.vars` (copy of example, HASH_SALT set) is git-ignored. wrangler dev: `npx wrangler dev --port 8790 --ip 127.0.0.1`.
- Cron trigger locally: POST /cdn-cgi/local/explorer/api/local/scheduled?worker=nhip-so {"cron":"17 3 * * *"}
