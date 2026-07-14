-- ============================================================================
-- assets ↔ products: Verknüpfung (product_id) absichern + Index
--
-- Ein Bild gehört zu genau EINEM Artikel (n:1) → eine nullable FK-Spalte
-- assets.product_id reicht; keine m:n-Zwischentabelle nötig.
--
-- Die Spalte product_id existiert bereits (20260710130000_assets.sql), ist
-- aber NICHT indexiert. Diese Migration:
--   1) sichert die Spalte additiv/idempotent ab (add column if not exists),
--      falls sie in einer Umgebung fehlen sollte,
--   2) legt einen Index auf product_id an (für Lookups "alle Bilder zu Artikel
--      X" und für die FK-Prüfung bei product-Löschungen).
--
-- REIN ADDITIV: nur ADD COLUMN IF NOT EXISTS und CREATE INDEX IF NOT EXISTS.
-- Kein Drop/Rename/Typwechsel, keine bestehende Spalte oder Policy wird
-- verändert, org-Scoping/RLS bleiben unberührt. Idempotent.
--
-- NICHT AUTOMATISCH ANWENDEN. Wird separat im Supabase SQL Editor
-- (Projekt wyddahfnxiilootylcwg) ausgeführt — VOR der Zuordnungs-SQL.
-- Voraussetzung: Tabellen assets und products bestehen.
-- ============================================================================

alter table assets
  add column if not exists product_id uuid references products(id);

create index if not exists assets_product_id_idx
  on assets (product_id);
