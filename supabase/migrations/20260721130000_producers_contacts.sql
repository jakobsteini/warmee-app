-- ============================================================================
-- LIEFERANTEN-KONTAKTE: bis zu 3 E-Mail-Kontakte je Lieferant
-- Kundenentscheidung: je Lieferant sollen bis zu 3 Kontakte hinterlegbar sein
-- (meist eine Aufsichtsperson o. Ä.). Bewusst EINFACH — nur Name + E-Mail je
-- Kontakt, kein separates Kontakt-Objekt/keine eigene Tabelle.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle producers.
-- Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung (producers behält
-- seine bestehenden org-scoped Policies). Bestehende Lieferanten bleiben gültig —
-- alle neuen Spalten sind nullable und starten NULL (kein stiller Datenverlust).
--
-- Kein DB-CHECK auf das E-Mail-Format: die Validierung ist bewusst app-seitig
-- (isValidEmail / block-statt-raten), wie bei den übrigen Formularfeldern.
--
-- Voraussetzung: Tabelle producers besteht (aus 20260713130000).
--
-- Neu (alle text nullable):
--   kontakt1_name, kontakt1_email
--   kontakt2_name, kontakt2_email
--   kontakt3_name, kontakt3_email
-- ============================================================================

alter table producers
  add column if not exists kontakt1_name  text,
  add column if not exists kontakt1_email text,
  add column if not exists kontakt2_name  text,
  add column if not exists kontakt2_email text,
  add column if not exists kontakt3_name  text,
  add column if not exists kontakt3_email text;
