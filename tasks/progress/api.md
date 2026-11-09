# Progress — feat/api (Cloudflare backend + community widgets)

## Done
- (bắt đầu) đọc DESIGN.md, config, layouts, stubs

## Next
1. wrangler.jsonc + migrations/0001_init.sql
2. worker/ (index.ts, lib, tsconfig) + typecheck
3. src/scripts/api.ts + tests/unit/api*.test.ts
4. ViewCount.astro
5. Reactions.astro
6. Comments.astro (giscus)
7. Analytics.astro + config fields
8. Newsletter.astro refine (Turnstile)
9. scripts/test-api.mjs + run against wrangler dev
10. Browser check widgets (390x844, 1440x900, light/dark)
11. docs/CLOUDFLARE.md + .dev.vars.example

## Notes
- PostLayout renders `<Comments />` without props → Comments uses Astro.url / pathname mapping; no slug needed.
