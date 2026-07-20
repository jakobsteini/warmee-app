-- ============================================================================
-- RETOUREN — Steuer-Pflichthinweis (returns.tax_note)
-- Kleine additive Folge zu 20260720140000_tax_category_oss.sql (die bereits
-- eingespielt ist). Retouren brauchen — wie Rechnungen — einen eigenen
-- eingefrorenen Steuer-Hinweis (Reverse Charge / Ausfuhr), Kundenentscheidung
-- Verena. Hier NUR die Spalte; die Ausgabe auf der Retouren-/Gutschrift-PDF
-- kommt erst beim Einhängen der Steuerlogik (späterer Teil).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS. Kein DROP, kein RENAME, kein Typwechsel, keine
-- RLS-Änderung. Bestehende returns (tax_rate/tax_amount/total_amount eingefroren)
-- bleiben unberührt — tax_note startet NULL.
--
-- Voraussetzung: Tabelle returns besteht (aus 20260716140000_returns.sql).
-- ============================================================================

alter table returns
  add column if not exists tax_note text;
