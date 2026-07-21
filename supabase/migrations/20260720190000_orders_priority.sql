-- ============================================================================
-- PRIORITÄTS-HÄKCHEN an der Kundenorder (aus Verenas WhatsApp-Ergänzung)
-- Eine Order kann als „Priorität" markiert werden, damit sie später bei der
-- Warenverteilung bevorzugt berücksichtigt wird. Diese Migration legt NUR das
-- Feld an — die Verteil-WIRKUNG kommt später (hängt an der offenen Entscheidung,
-- welche Priorität bei Knappheit gewinnt; heute ohne Verbraucher).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle orders. Kein DROP,
-- kein RENAME, kein Typwechsel, keine RLS-Änderung. Echtdaten-safe — bestehende
-- Orders bekommen den Default false.
--
-- Voraussetzung: Tabelle orders besteht.
-- ============================================================================

alter table orders
  add column if not exists priority boolean not null default false;
