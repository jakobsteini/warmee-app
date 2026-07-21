-- ============================================================================
-- ZAHLUNGSBEDINGUNGEN JE AUFTRAGSBESTÄTIGUNG (Order-Konditionen)
-- Kundenentscheidung: Skonto und Zahlungsziel werden NICHT fix am Kunden
-- hinterlegt, sondern von den Mitarbeitern direkt an jeder Order/AB bestimmt.
-- Strukturierte Felder (damit die automatische Skonto-Berechnung möglich bleibt)
-- plus ein Freitext für Sonderfälle.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle orders.
-- Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung (orders behält
-- seine bestehenden org-scoped Policies).
--
-- Bestandsschutz: bestehende Orders bekommen zahlungsziel_tage = 30 (Default,
-- WARM-ME-Standard „30 Tage netto"), skonto_* / Freitext bleiben NULL
-- (= kein Skonto). Kein stiller Datenverlust.
--
-- Kein DB-CHECK auf die Wertebereiche (0–100 %, skonto_tage <= zahlungsziel):
-- die Validierung ist bewusst app-seitig (parseDecimalField / block-statt-raten),
-- wie bei den übrigen Kopffeldern.
--
-- Voraussetzung: Tabelle orders besteht.
--
-- Neu:
--   zahlungsziel_tage          integer  NOT NULL DEFAULT 30 — Zahlungsziel in Tagen
--   skonto_prozent             numeric(5,2)  (nullable)      — Skontosatz, optional
--   skonto_tage                integer       (nullable)      — Skontofrist in Tagen
--   zahlungsbedingung_freitext text          (nullable)      — Sonderfall-Freitext
-- ============================================================================

alter table orders
  add column if not exists zahlungsziel_tage          integer not null default 30,
  add column if not exists skonto_prozent             numeric(5,2),
  add column if not exists skonto_tage                integer,
  add column if not exists zahlungsbedingung_freitext text;
