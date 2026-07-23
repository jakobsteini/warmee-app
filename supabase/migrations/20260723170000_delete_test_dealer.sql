-- ============================================================================
-- Datenbereinigung: Testhaendler "ZZ TEST — loeschen" samt Abhaengigkeiten
-- vollstaendig entfernen. KEINE Schemaaenderung.
--
-- Freigabe: Kunde hat "hart loeschen inkl. Belege" gewaehlt. Begruendung ist
-- vertretbar, weil es sich ausschliesslich um Testdaten handelt:
--   - die 10 Lieferscheine (LS-2026-0001..0010) und 3 Rechnungen
--     (2026-0001, 2026-0002, ZZTEST-0001, ALLE storniert) sind die EINZIGEN
--     nummerierten Belege der gesamten Organisation — kein anderer Haendler hat
--     einen Beleg. Es entsteht also KEINE Luecke in einer echten Belegreihe;
--     die Nummernkreise 2026 werden auf leer zurueckgesetzt (sauberer Go-Live).
--
-- BLOCK STATT RATEN: Anker ist die exakte dealer.id UND (beim finalen Loeschen)
-- die Kundennummer 92838 — trifft ausschliesslich diesen einen Datensatz.
-- IDEMPOTENT: Jede Anweisung filtert auf dealer_id/id; ein zweiter Lauf trifft
-- 0 Zeilen (kein Fehler). Reihenfolge: Kinder vor Eltern, damit keine
-- Fremdschluessel brechen. Als Transaktion (alles-oder-nichts).
--
-- WAECHTER: nur dieser eine Haendler und seine Abhaengigkeiten. Keine anderen
-- Daten, keine Logik, keine Nummernkreis-Funktionen veraendert. NICHT
-- AUTOMATISCH ANWENDEN (Supabase SQL Editor, Projekt wyddahfnxiilootylcwg).
--
-- FK-Analyse (Stand Migrationen):
--   invoices.delivery_id  -> deliveries   (NOT NULL)  => invoices VOR deliveries
--   delivery_notes.delivery_id -> deliveries          => delivery_notes VOR deliveries
--   deliveries.order_id   -> orders       (kein cascade) => deliveries VOR orders
--   invoice_items->invoices, delivery_items->deliveries,
--   order_items->orders, return_items->returns          (ON DELETE CASCADE)
--   dealer_aliases/emails/season_priority/asset_dealers/newsletters ->
--     dealers (ON DELETE CASCADE) — hier ohnehin 0 Zeilen.
-- ============================================================================

begin;

-- 1) Rechnungen zuerst (invoice_items cascaden; loest delivery_id-Referenzen).
--    dunning_history/returns an diesen Rechnungen: 0.
delete from invoices
where dealer_id = '558f80e5-0413-4fc8-b879-2ff2e0cd036c';

-- 2) Lieferscheine (vergebene Nummern, keine Kinder; loest delivery-Referenz).
delete from delivery_notes
where dealer_id = '558f80e5-0413-4fc8-b879-2ff2e0cd036c';

-- 3) Lieferungen (delivery_items cascaden; loest order_id-Referenz).
delete from deliveries
where dealer_id = '558f80e5-0413-4fc8-b879-2ff2e0cd036c';

-- 4) Orders (order_items cascaden).
delete from orders
where dealer_id = '558f80e5-0413-4fc8-b879-2ff2e0cd036c';

-- 5) Der Haendler selbst — doppelt verankert (id UND Kundennummer 92838).
--    Etwaige Cascade-Kinder (aliases/emails/priority/asset_dealers/newsletters)
--    sind 0 und wuerden ohnehin mitcascaden.
delete from dealers
where id = '558f80e5-0413-4fc8-b879-2ff2e0cd036c'
  and kundennummer = 92838;

commit;
