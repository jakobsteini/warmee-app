-- ============================================================================
-- Skonto-Snapshot auf der Rechnung
-- Baustein „Skonto einfrieren + Zahlbetrag-Vorschlag" (2026-07-17).
--
-- Snapshot-Muster (KONVENTIONEN): Skontosatz und -frist werden BEIM ANLEGEN der
-- Rechnung aus den Händlerkonditionen (dealers.skonto_prozent/skonto_tage, sonst
-- WARM-ME-Standard 3 %/10 T) eingefroren — analog zu invoices.due_date. Ändert
-- Theresa später die Händler-Kondition, verschieben sich bereits gestellte
-- Rechnungen dadurch NICHT rückwirkend.
--
-- Rein additiv, nullable, KEIN Backfill: Altbestände bleiben null und werden bei
-- Anzeige/PDF-Regenerierung wie bisher mit dem Hausstandard behandelt (genau so
-- wurden ihre PDFs gedruckt) — kein stilles Verändern verschickter Rechnungen.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Kein DROP/RENAME/Typwechsel; org_id/RLS unverändert.
-- ============================================================================

alter table invoices
  add column if not exists skonto_prozent numeric(5,2),
  add column if not exists skonto_tage    integer;
