-- ============================================================================
-- RETOUREN — Steuerausweis (Variante B): returns trägt Netto/USt/Brutto wie die
-- Rechnung. Damit sind offener Rest (Modul 3) und Provisions-deductions (Modul 5)
-- BRUTTO-konsistent — beide Bemessungsgrundlagen (invoice.total, gross_received)
-- sind brutto.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: returns aus 20260716140000_returns.sql.
--
-- REIN ADDITIV: nur ADD COLUMN IF NOT EXISTS. Kein DROP, kein RENAME, kein
-- Typwechsel. returns ist noch leer → kein Datenumbau nötig.
--
-- Semantik ab dieser Migration (konsistent zur Rechnung: subtotal/tax_amount/
-- total, Satz zentral aus tax.ts via applyVat):
--   subtotal_net  = Nettosumme der Retouren-Positionen (Σ Menge × Nettopreis)
--   tax_rate      = Steuersatz als Faktor (0.20), eingefroren zum Erfassungszeitpunkt
--   tax_amount    = ausgewiesene USt auf den Nettobetrag
--   total_amount  = BRUTTO (Netto + USt) — bisher als Nettosumme gemeint, jetzt
--                   brutto; die return_items.line_total bleiben (wie invoice_items)
--                   netto.
-- Alle drei sind Snapshot-Werte (eingefroren wie unit_price/line_total).
-- ============================================================================

alter table returns add column if not exists subtotal_net numeric(10,2) not null default 0;
alter table returns add column if not exists tax_rate     numeric(5,2)  not null default 0;
alter table returns add column if not exists tax_amount   numeric(10,2) not null default 0;
