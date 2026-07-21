-- ============================================================================
-- VERSANDART MIT FREITEXT-OPTION (Order-Kopfdaten)
-- Kundenentscheidung: keine weiteren festen Versandanbieter außer DPD und DSV,
-- aber ein frei anpassbares Feld („to be customized"). Umsetzung: das bestehende
-- Feld orders.shipping_method (app-seitiges Enum dpd/dsv, aus 20260720170000)
-- bekommt den zusätzlichen Wert „sonstige" (rein app-seitig, KEIN DB-CHECK), und
-- der zugehörige Freitext wird in EINER neuen Spalte gehalten.
--
-- Es wird NICHT gedoppelt: shipping_method bleibt das Versandart-Feld. Neu ist
-- nur der Freitext für den Fall „sonstige".
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle orders.
-- Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung. Bestandsaufträge
-- bleiben gültig: shipping_method_freitext startet NULL, kein Default auf
-- shipping_method (leer bleibt erlaubt) — kein stiller Datenverlust.
--
-- Voraussetzung: Tabelle orders besteht (mit shipping_method aus 20260720170000).
--
-- Neu:
--   shipping_method_freitext  text (nullable) — Freitext, nur bei „sonstige" relevant
-- ============================================================================

alter table orders
  add column if not exists shipping_method_freitext text;
