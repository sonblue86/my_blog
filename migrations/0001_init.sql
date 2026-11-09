-- Nhịp Số — initial schema: view counts, reactions, newsletter sign-ups.
-- Apply: npx wrangler d1 migrations apply blog-db --local   (or --remote)
--
-- Write-cost design (D1 bills "rows written"):
--   * Every counted action is ONE `INSERT OR IGNORE INTO dedupe`. A duplicate (same visitor, same day,
--     same post, same action) is ignored and costs 0 rows written.
--   * A successful insert fires an AFTER INSERT trigger that bumps the counter (1 more row).
--   * The visitor key is a truncated SHA-256 of (day | ip | user-agent | secret salt): no PII is stored,
--     and it changes every day.

CREATE TABLE IF NOT EXISTS page_views (
  slug  TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reactions (
  slug  TEXT NOT NULL,
  kind  TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, kind)
);

-- action: 'view' | 'react:<kind>'
CREATE TABLE IF NOT EXISTS dedupe (
  day     TEXT NOT NULL,
  visitor TEXT NOT NULL,
  slug    TEXT NOT NULL,
  action  TEXT NOT NULL,
  PRIMARY KEY (day, visitor, slug, action)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS dedupe_count_view
AFTER INSERT ON dedupe
WHEN NEW.action = 'view'
BEGIN
  INSERT INTO page_views (slug, views) VALUES (NEW.slug, 1)
  ON CONFLICT (slug) DO UPDATE SET views = views + 1;
END;

CREATE TRIGGER IF NOT EXISTS dedupe_count_reaction
AFTER INSERT ON dedupe
WHEN NEW.action LIKE 'react:%'
BEGIN
  INSERT INTO reactions (slug, kind, count) VALUES (NEW.slug, substr(NEW.action, 7), 1)
  ON CONFLICT (slug, kind) DO UPDATE SET count = count + 1;
END;

-- Newsletter: capture only (Workers Free cannot send email). Export with wrangler, see docs/CLOUDFLARE.md.
CREATE TABLE IF NOT EXISTS subscribers (
  email      TEXT PRIMARY KEY COLLATE NOCASE,
  status     TEXT NOT NULL DEFAULT 'active', -- 'active' | 'unsubscribed'
  source     TEXT,
  created_at TEXT NOT NULL
);
