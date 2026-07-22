-- ============================================================================
-- ORDER→LIEFERSCHEIN-LINK — Session 3: Versandart auf dem Lieferschein (Snapshot)
-- Seit dem Order→Lieferung-Link (Session 1) kennt der Lieferschein seine Order
-- (delivery.order_id). Die Versandart (inkl. „Sonstige"-Freitext) wird künftig
-- AUS DER ORDER auf den Lieferschein übernommen und beim Erzeugen EINGEFROREN —
-- konsistent zum Snapshot-Muster (Kundenentscheidung).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle delivery_notes. Kein
-- DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung.
--
-- Wächter: bestehende Lieferscheine behalten NULL → keine Versandart-Zeile, das
-- gespeicherte PDF ist unverändert (es gibt keinen Regenerate-Pfad). Der Snapshot
-- wird nur bei NEU erzeugten Lieferscheinen mit gesetztem order_id gefüllt.
--
-- Voraussetzung: Tabelle delivery_notes besteht.
--
-- Neu (beide text nullable):
--   shipping_method           — DPD / DSV / sonstige (roh, aus der Order)
--   shipping_method_freitext  — Freitext, nur bei „sonstige"
-- ============================================================================

alter table delivery_notes
  add column if not exists shipping_method          text,
  add column if not exists shipping_method_freitext text;
