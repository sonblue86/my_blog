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

## Next
1. Browser check widgets with real backend (wrangler dev :8792) + graceful degradation (astro preview :4422)
2. docs/CLOUDFLARE.md
3. Final: tsc worker, vitest, astro check

## Notes
- PostLayout renders `<Comments />` without props → Comments uses pathname mapping; no slug needed.
- Decision: worker Env is hand-written (worker/env.ts); `wrangler types` output NOT committed → integrator should
  gitignore `worker-configuration.d.ts` and change/remove `cf-typegen` script (root file would break astro check).
- Local run: `.dev.vars` (copy of example, HASH_SALT set) is git-ignored. wrangler dev: `npx wrangler dev --port 8790 --ip 127.0.0.1`.
- Cron trigger locally: POST /cdn-cgi/local/explorer/api/local/scheduled?worker=nhip-so {"cron":"17 3 * * *"}
