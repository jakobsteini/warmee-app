-- ============================================================================
-- assets: Metadaten-Spalten aus dem Dateinamen (model, Farbe, Social-Media)
--
-- Die 94 WARM-ME-Produktbilder tragen die Metadaten im Dateinamen
-- (z. B. "EmyShaded_530_olivine_531_mayfly.JPG"). Der Parser
-- (src/lib/assetFilename.ts) leitet daraus Modell, Farbcode(s)/Farbname(n)
-- und die Social-Media-Kennung ab und befüllt den Upload vor. Diese Migration
-- legt die Zielspalten dafür an.
--
-- FARB-MODELL: skalare Spalten statt Array.
--   Ein Dateiname hat max. ZWEI Farben (Haupt- + Zweitfarbe). Für den
--   Newsletter-/Filter-Use-Case (Baustein B) sind einfache Text-Spalten
--   deutlich handlicher als ein Postgres-Array: "alle olivine-Bilder" ist
--   ein simples WHERE color_code = '530', ohne Array-Operatoren, GIN-Index
--   oder Sonderfälle in RLS. Die Zweitfarbe geht trotzdem nicht verloren –
--   sie landet in color_code_2/color_name_2. Sollten je >2 Farben nötig
--   werden, kann später additiv auf ein Array migriert werden.
--     color_code / color_name      → Haupt-(erste) Farbe
--     color_code_2 / color_name_2  → optionale Zweitfarbe
--
-- REIN ADDITIV: nur ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Kein Drop/
-- Rename/Typwechsel, keine bestehende Spalte oder Policy wird verändert,
-- org-Scoping/RLS bleiben unberührt. Idempotent (IF NOT EXISTS).
--
-- NICHT AUTOMATISCH ANWENDEN. Wird separat im Supabase SQL Editor
-- (Projekt wyddahfnxiilootylcwg) ausgeführt — VOR dem Upload der 94 Bilder.
-- Voraussetzung: Tabelle assets besteht (20260710130000_assets.sql).
-- ============================================================================

alter table assets
  add column if not exists model            text,
  add column if not exists color_code       text,
  add column if not exists color_name       text,
  add column if not exists color_code_2     text,
  add column if not exists color_name_2     text,
  add column if not exists is_social_media  boolean not null default false;
