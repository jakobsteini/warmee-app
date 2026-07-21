-- ============================================================================
-- LIEFERANTEN-ORDER NEPAL — Modul C: Belegsprache je Lieferant
-- Die Bestellmail/das Bestell-PDF an den Lieferanten soll in dessen Sprache
-- ausgegeben werden (Kundenentscheidung: konfigurierbar). Nepal → Englisch als
-- sinnvoller Default; das leitet die App aus einem leeren/‚en'-Wert ab.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle producers. Kein DROP,
-- kein RENAME, kein Typwechsel, keine RLS-Änderung. Bestehende Lieferanten
-- bleiben gültig (Spalte startet NULL → App behandelt NULL als Englisch).
--
-- Kein DB-CHECK auf den Wert (app-seitig 'de'/'en'/NULL), wie bei den übrigen
-- optionalen Textfeldern.
--
-- Voraussetzung: Tabelle producers besteht.
-- ============================================================================

alter table producers
  add column if not exists language text;
