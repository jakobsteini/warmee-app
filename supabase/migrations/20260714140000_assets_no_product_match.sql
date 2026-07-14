-- ============================================================================
-- assets: Flag "bewusst kein Artikel" (no_product_match)
--
-- Manche Bilder (v. a. reine Farbmuster ohne Modell) gehören zu KEINEM Artikel.
-- Damit sie in der Ansicht "Bilder zuordnen" dauerhaft abgehakt bleiben und
-- nicht bei jedem Laden erneut auftauchen, braucht es ein persistentes Flag –
-- product_id allein (null = "noch offen") kann "geprüft, kein Artikel" nicht
-- ausdrücken.
--
--   "erledigt" = product_id is not null OR no_product_match = true
--
-- REIN ADDITIV: nur ADD COLUMN IF NOT EXISTS. Kein Drop/Rename/Typwechsel,
-- keine bestehende Spalte oder Policy wird verändert, org-Scoping/RLS bleiben
-- unberührt. Idempotent. Bestehende Zeilen bekommen den Default false.
--
-- NICHT AUTOMATISCH ANWENDEN. Wird separat im Supabase SQL Editor
-- (Projekt wyddahfnxiilootylcwg) ausgeführt.
-- Voraussetzung: Tabelle assets besteht (20260710130000_assets.sql).
-- ============================================================================

alter table assets
  add column if not exists no_product_match boolean not null default false;
