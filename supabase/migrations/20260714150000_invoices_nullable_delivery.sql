-- ============================================================================
-- invoices.delivery_id nullable — freie Rechnungen ohne Lieferung (#7)
--
-- Bisher entsteht jede Rechnung aus einer Lieferung (createInvoice), daher war
-- invoices.delivery_id NOT NULL. Eine "freie Rechnung" (manuelle Positionen,
-- ohne zugrundeliegende Order/Lieferung) hat keine delivery_id. Damit ein
-- solcher Datensatz in DERSELBEN invoices-Tabelle liegen kann (gleicher
-- Nummernkreis, gleiche Liste/Offene-Posten/Storno-Logik), muss die
-- NOT-NULL-Bedingung auf delivery_id gelockert werden.
--
-- CONSTRAINT-LOCKERUNG, kein Datenverlust:
--   * Nur ALTER COLUMN ... DROP NOT NULL. Kein Drop/Rename/Typwechsel.
--   * Der Foreign-Key auf deliveries(id) BLEIBT bestehen (nullable FK):
--     order-basierte Rechnungen verweisen weiter auf ihre Lieferung, freie
--     Rechnungen tragen NULL.
--   * Bestehende Zeilen unverändert (alle haben bereits eine delivery_id).
--   * RLS/org-scoping unberührt — keine Policy-Änderung.
--   * Idempotent: DROP NOT NULL auf einer bereits nullbaren Spalte ist ein
--     No-op.
--
-- NICHT AUTOMATISCH ANWENDEN. Wird separat im Supabase SQL Editor
-- (Projekt wyddahfnxiilootylcwg) ausgeführt.
-- Voraussetzung: Tabelle invoices besteht (20260711150000_invoices.sql).
-- ============================================================================

alter table invoices
  alter column delivery_id drop not null;
