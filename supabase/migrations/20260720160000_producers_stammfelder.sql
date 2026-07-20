-- ============================================================================
-- LIEFERANTEN-STAMMFELDER (Thema 3, Kap. 10): producers als eigener Stammbereich
-- Ergänzt die producers-Tabelle (aus 20260713130000, hält die 7 Shangri-La/
-- Red-Street-Lieferanten aus B1) um die Template-Felder für den Lieferanten-
-- Stammbereich. Lieferanten sind bewusst EINFACH — kein B2B/B2C, keine POS,
-- keine Steuerkategorie (das ist der Kundenstamm/dealers).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle producers.
-- Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung (producers behält
-- seine bestehenden org-scoped Policies). Die 7 bestehenden Lieferanten bleiben
-- gültig — alle neuen Spalten sind nullable und starten NULL.
--
-- Voraussetzung: Tabelle producers besteht.
--
-- name/country/active/priority existieren bereits. Neu (alle text nullable):
--   contact_person      — Ansprechperson
--   contact_person_alt  — Kontaktperson (falls abweichend)
--   email               — E-Mail (Freitext)
--   address             — vollständige Adresse (Freitext, mehrzeilig)
--   uid                 — UID-Nr. (optional)
-- ============================================================================

alter table producers
  add column if not exists contact_person     text,
  add column if not exists contact_person_alt text,
  add column if not exists email              text,
  add column if not exists address            text,
  add column if not exists uid                text;
