-- ============================================================================
-- ORDER→RECHNUNG-LINK — Session 2: Zahlungsbedingungs-Freitext auf der Rechnung
-- Seit dem Order→Lieferung-Link (Session 1) kennt die Rechnung ihre Order
-- (delivery.order_id). Die Zahlungsbedingungen werden künftig AUS DER ORDER
-- eingefroren (Kundenentscheidung): Zahlungsziel/Skonto liegen bereits als
-- invoices.due_date/skonto_prozent/skonto_tage vor — es fehlt nur der eingefrorene
-- Freitext (orders.zahlungsbedingung_freitext).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle invoices. Kein DROP,
-- kein RENAME, kein Typwechsel, keine RLS-Änderung.
--
-- Wächter: bestehende Rechnungen behalten den Wert NULL → keine Freitext-Zeile,
-- Beleg unverändert. Der Snapshot wird nur bei NEU erzeugten Rechnungen mit
-- gesetztem order_id gefüllt; freie Rechnungen bleiben NULL (Händlerkonditionen).
--
-- Voraussetzung: Tabelle invoices besteht.
-- ============================================================================

alter table invoices
  add column if not exists zahlungsbedingung_freitext text;
