# Tiến độ — agent "docs" (branch feat/docs)

Phạm vi: Sveltia CMS (`public/admin/**`), `scripts/new-post.mjs` + `scripts/lib/**`, unit tests
(`tests/unit/{posts,date,newpost}*.test.ts`), `README.md` + `LICENSE`, `.github/**`.

## Done
- [ ] (chưa có)

## Next
1. Sveltia CMS: `public/admin/index.html` + `public/admin/config.yml` (+ kiểm tra YAML/schema)
2. `scripts/new-post.mjs` + `scripts/lib/new-post-core.mjs` + `tests/unit/newpost.test.ts`
3. `tests/unit/posts.test.ts`, `tests/unit/date.test.ts`
4. `README.md` + `LICENSE`
5. `.github/workflows/ci.yml` + `scheduled-deploy.yml`
6. Kiểm tra: astro build, astro check, vitest, xem /admin trong trình duyệt (390 & 1440)

## Notes
- Worktree: D:/project-AI/blog-wt/docs. node_modules là junction — không npm install.
- Preview port 4415, playwright-cli session `docs`.
