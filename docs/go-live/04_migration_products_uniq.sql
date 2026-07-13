-- ============================================================================
-- 04 · MIGRATION products_season_style_uniq (Unique-Index für Artikel-Upsert)
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (IF NOT EXISTS).
-- Legt Unique-Index products(org_id, season_id, style) an.
-- ============================================================================


create unique index if not exists products_org_season_style_uniq
  on products (org_id, season_id, style);
