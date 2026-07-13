-- ============================================================================
-- MODUL B3 — Zahlungseingang mit Datum & Betrag (invoices.paid_at/paid_amount)
--
-- Diese Migration MUSS ausgeführt werden — Supabase SQL Editor / Management API,
-- Projekt wyddahfnxiilootylcwg. Voraussetzung: Tabelle invoices besteht bereits
-- (Modul A6, 20260711150000_invoices.sql).
--
-- Zweck: Der bisherige „als bezahlt"-Flow kannte nur status='paid' ohne
-- Zeitpunkt/Betrag. Für Provision, Bonität und Auswertungen braucht es das
-- tatsächliche Zahlungsdatum und den gezahlten Betrag. Ab jetzt gilt paid_at
-- als maßgebliche Quelle des Bezahlt-Zustands; die bestehende status-Spalte
-- bleibt erhalten und wird von der App synchron auf 'paid' gesetzt (viele
-- Queries/Badges hängen daran).
--
-- Bewusste Entscheidung: KEINE Teilzahlungen. Genau EIN Zahlungsdatum + EIN
-- Betrag je Rechnung. Eine spätere Erweiterung auf Teilzahlungen bliebe rein
-- additiv möglich (eigene payments-Tabelle, Bezahlt-Status dann aus der Summe
-- abgeleitet) — sie ist hier NICHT umgesetzt.
--
-- HARTE REGELN (eingehalten):
--   * REIN ADDITIV — nur ADD COLUMN IF NOT EXISTS. Kein DROP, kein RENAME,
--     kein Typwechsel, keine bestehende Spalte verändert.
--   * Beide neuen Spalten NULLABLE (unbezahlte Rechnungen haben kein Datum).
--   * RLS unberührt: keine neue Tabelle, keine Policy-Änderung. Die neuen
--     Spalten unterliegen der bereits aktiven org-scoped RLS von invoices.
--   * Idempotent / re-runnable.
-- ============================================================================

-- ─── INVOICES: Zahlungseingang ──────────────────────────────────────────────
-- paid_at als date (konsistent mit invoice_date/due_date; eine Zahlung fällt
-- auf einen Tag). paid_amount als numeric(10,2) wie total.
alter table invoices
  add column if not exists paid_at     date,
  add column if not exists paid_amount numeric(10,2);
