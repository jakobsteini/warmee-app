-- ============================================================================
-- 05 · MIGRATION production_order_items_positions (Positions-Spalten + product_id NULLABLE)
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (IF NOT EXISTS).
-- Ergänzt Positions-Spalten; product_id wird NULLABLE.
-- ============================================================================

-- ─── 1) Additive Positions-Spalten (alle nullable) ──────────────────────────
alter table production_order_items
  add column if not exists modell             text,
  add column if not exists modell_description text,
  add column if not exists quality            text,
  add column if not exists color_description  text,
  add column if not exists group_name         text,
  add column if not exists price_per_piece    numeric(10,2),
  add column if not exists whole_price        numeric(10,2);

-- ─── 2) product_id von NOT NULL auf NULLABLE ────────────────────────────────
--
-- WARUM: Die Nepal-Order ist FW26, der aktuell geladene Katalog ist SS27. Nur
-- Positionen, deren "Modell Description" EXAKT einem products.style entspricht,
-- bekommen eine product_id — alle übrigen (die große Mehrheit) müssen
-- product_id = NULL tragen. Es werden bewusst KEINE Phantom-Artikel angelegt.
-- Daher darf product_id nicht länger NOT NULL sein.
--
-- UNBEDENKLICH: DROP NOT NULL ist in Postgres eine reine Metadaten-Operation —
-- kein Table-Rewrite, kein Scan, kein Datenverlust. Bestehende Zeilen (alle mit
-- gesetzter product_id) bleiben unverändert gültig. Reversibel, solange keine
-- NULL-Werte existieren (dann wieder SET NOT NULL möglich).
--
-- Der FOREIGN-KEY-Constraint auf products(id) bleibt UNVERÄNDERT bestehen — hier
-- wird ausschließlich die NOT-NULL-Bedingung entfernt.
alter table production_order_items
  alter column product_id drop not null;
