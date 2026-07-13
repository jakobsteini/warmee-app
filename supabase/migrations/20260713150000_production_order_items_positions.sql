-- ============================================================================
-- production_order_items: Positions-Felder + product_id NULLABLE
--
-- Macht die Tabelle bereit für den scharfen Nepal-Import (scripts/
-- importProductionOrder.ts, "3. Order FW26"). Die Produzenten-Order enthält
-- Felder, die es bisher nicht als Spalten gab, und Positionen ohne Treffer im
-- (SS27-)Katalog dürfen keinen Artikel referenzieren.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor / Management API,
-- Projekt wyddahfnxiilootylcwg) und wird später gebündelt mit den anderen
-- offenen Migrationen angewendet. Voraussetzung: Tabelle production_order_items
-- besteht (aus 20260711130000_production_orders.sql).
--
-- REGELN: additive Spalten (alle nullable, IF NOT EXISTS). Bestehende Spalten
-- color und total_quantity bleiben UNANGETASTET. Kein DROP von Spalten, kein
-- RENAME, keine Änderung an den RLS-Policies (Tabelle bleibt org-scoped über
-- ihre bestehenden poi_*-Policies). Die EINZIGE nicht-rein-additive Operation
-- im gesamten Projekt ist das ALTER COLUMN ... DROP NOT NULL weiter unten.
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
