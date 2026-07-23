-- ============================================================================
-- LIEFERANTEN-ORDER NEPAL — Kunden-Zuteilung manuell übersteuern (Nachvollzieh-
-- barkeit). Die eingefrorene Prioritäts-Aufteilung (supplier_order_allocations)
-- kann zwischen „gesendet" und dem Erzeugen der Verteilung (generateDeliveries)
-- je Kunde/Position von Hand angepasst werden. Damit später erkennbar bleibt,
-- WO von der Automatik abgewichen wurde, bekommt jede Zuteilungszeile ein Flag
-- + Zeitstempel + Bearbeiter.
--
-- REIN ADDITIV & idempotent: nur ADD COLUMN IF NOT EXISTS. Kein DROP/RENAME,
-- kein Typwechsel, keine RLS-Änderung. Bestandsdaten bleiben gültig
-- (is_overridden default false → alle bisherigen Zuteilungen gelten als „nicht
-- übersteuert", also automatisch aus der Priorität).
--
-- NICHT AUTOMATISCH ANWENDEN. Im Supabase SQL Editor (Projekt
-- wyddahfnxiilootylcwg) einspielen. Voraussetzung: supplier_order_allocations,
-- profiles.
-- ============================================================================

alter table supplier_order_allocations
  add column if not exists is_overridden boolean not null default false,
  add column if not exists overridden_at timestamptz,
  add column if not exists overridden_by uuid references profiles(id);
