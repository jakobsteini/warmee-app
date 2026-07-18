-- ============================================================================
-- ARTIKEL-/PRODUKTIONS-FELDER erweitern (2026-07-18)
-- Aus Theresas Anforderungsliste, zwei Felder:
--   1) Transportkosten je Produktion  → production_orders.transportkosten
--   2) Pantone-Code je Farbe (Swatch)  → assets.pantone_code
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf BESTEHENDEN Tabellen. Kein DROP,
-- kein RENAME, kein Typwechsel, keine RLS-Änderung (beide Tabellen behalten ihre
-- bestehenden org-scoped Policies). Die Echtdaten bleiben gültig — die neuen
-- Spalten starten NULL.
--
-- Fachliche Entscheidungen (mit Jakob abgestimmt):
--   1) EINKAUFSPREIS bekommt KEIN neues Feld: der Stamm-EK liegt bereits in
--      products.purchase_price, der Ist-EK je Produktion in
--      production_order_items.price_per_piece. Hier nichts zu tun.
--   2) TRANSPORTKOSTEN sind eine Ist-Kost je PRODUKTION (Nepal-Fracht ≠
--      Portugal-Fracht), kein Plan-Zuschlag je Artikel → an production_orders
--      (Kopf), nicht an products. numeric(10,2) wie die übrigen Geldfelder.
--   3) PANTONE-CODE hängt am SWATCH (assets), wo Farbnummer (color_code) und
--      Farbname (color_name) ohnehin schon leben — KEINE product_colors-Tabelle
--      (die würde die Swatch-Zeile verdoppeln). Freitext, Format frei
--      ("19-3909 TCX"). Bewusste Grenze: nur Farben MIT Musterfoto bekommen
--      einen Pantone-Code; Farben ohne Swatch bleiben ohne. Eine echte
--      colors-Registry ist ein eigener späterer Baustein.
-- ============================================================================

-- ─── 1) Transportkosten je Produktion (Kopf) ────────────────────────────────
alter table production_orders
  add column if not exists transportkosten numeric(10,2);

-- ─── 2) Pantone-Code am Swatch (Freitext, je Farbe) ─────────────────────────
alter table assets
  add column if not exists pantone_code text;
