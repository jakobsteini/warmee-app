-- ============================================================================
-- Auftragsbestätigung per Mail — Versand-Status am Auftrag.
-- Hält fest, WANN und AN WEN die AB zuletzt per Mail verschickt wurde, damit
-- Auftragsdetail und -übersicht „gesendet / nicht gesendet" zeigen können.
-- Reiner Versand-Status — KEINE Auftragszahl, KEIN Snapshot wird berührt.
--
-- REIN ADDITIV & idempotent: nur ADD COLUMN IF NOT EXISTS. Kein DROP/RENAME,
-- kein Typwechsel. Bestandsdaten bleiben gültig (NULL = noch nicht versendet).
-- NICHT AUTOMATISCH ANWENDEN. Im Supabase SQL Editor (Projekt
-- wyddahfnxiilootylcwg) einspielen. Voraussetzung: orders.
-- ============================================================================

alter table orders
  add column if not exists ab_sent_at timestamptz,
  add column if not exists ab_sent_to text;
