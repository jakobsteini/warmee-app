-- ============================================================================
-- Unique-Index products(org_id, season_id, style) für den Artikel-Upsert
--
-- Der Artikel-Import (scripts/importArticles.ts) upsertet auf dem natürlichen
-- Schlüssel (org_id, season_id, style) — die Artikel-Excel hat keine
-- Artikelnummer. Damit ON CONFLICT greift, braucht es genau darauf einen
-- Unique-Index.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor / Management API,
-- Projekt wyddahfnxiilootylcwg) und wird später gebündelt mit den anderen
-- offenen Migrationen angewendet. Voraussetzung: Tabelle products + Spalte
-- style (aus 20260713120000_realdata_dealers_products.sql) bestehen.
--
-- REIN ADDITIV: nur CREATE UNIQUE INDEX IF NOT EXISTS. Kein Drop/Rename/
-- Typwechsel, bestehende RLS unberührt. Idempotent (IF NOT EXISTS).
--
-- ⚠ ACHTUNG BEIM ANWENDEN: Enthält products bereits Zeilen mit doppeltem,
-- NICHT-NULL (org_id, season_id, style) — z. B. aus Test-Importen —, schlägt
-- die Index-Erstellung fehl ("could not create unique index … duplicate key").
-- Dann zuerst die Dubletten in products bereinigen und erneut anwenden.
-- (NULL in season_id oder style gilt als verschieden und blockiert nicht.)
-- ============================================================================

create unique index if not exists products_org_season_style_uniq
  on products (org_id, season_id, style);
