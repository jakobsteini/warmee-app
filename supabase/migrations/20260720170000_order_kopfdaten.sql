-- ============================================================================
-- ORDER-KOPFDATEN (Thema 2, Kap. 3): Kopffelder an der Kundenorder
-- Ergänzt die orders-Tabelle um die fachlichen Kopfdaten. Saison ist bereits
-- Pflicht (season_id NOT NULL) und bleibt unverändert.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle orders.
-- Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung (orders behält
-- seine bestehenden org-scoped Policies). Bestehende Orders bleiben gültig —
-- alle neuen Spalten sind nullable und starten NULL.
--
-- Voraussetzung: Tabelle orders besteht.
--
-- Dropdown-Vokabular (order_type/shipping_method/shipping_terms/delivery_terms)
-- wird bewusst app-seitig validiert, KEIN DB-CHECK — so ist ein späterer Wert
-- (z. B. weitere Versandart) eine reine Code-Änderung, kein destruktiver
-- Constraint-Swap (Muster wie size_scheme / dealer_documents.category).
--
-- Neu (alle nullable):
--   order_type          text  — Vororder / Prompt Order / Lagerorder
--   shipping_method     text  — DPD / DSV (erweiterbar)
--   shipping_terms      text  — Versandkondition: Ab Werk / Frei Haus
--   delivery_terms      text  — Lieferkondition: Ab Werk / Frei Haus
--   delivery_date_from  date  — Lieferzeitraum von (optional)
--   delivery_date_to    date  — Lieferzeitraum bis (optional; App erzwingt from<=to)
--   po_number           text  — Kunden-Auftragsnummer / Freitext (separat von notes)
-- ============================================================================

alter table orders
  add column if not exists order_type         text,
  add column if not exists shipping_method    text,
  add column if not exists shipping_terms      text,
  add column if not exists delivery_terms      text,
  add column if not exists delivery_date_from  date,
  add column if not exists delivery_date_to    date,
  add column if not exists po_number           text;
