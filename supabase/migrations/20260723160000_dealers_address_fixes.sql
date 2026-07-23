-- ============================================================================
-- Datenkorrektur: Tippfehler in 6 Haendler-Adressen (vom Kunden freigegeben).
--
-- KEINE Schemaaenderung — nur gezielte UPDATEs auf Adressfelder. Beim Geocoding
-- (scripts/geocodeDealers.ts) blieben diese 6 unaufloesbar, weil der
-- Strassen-/Ortsname falsch geschrieben war. Nach der Korrektur greift ein
-- erneuter GEOCODE_APPLY=1-Lauf sie automatisch auf (lat/lng sind hier noch NULL).
--
-- BLOCK STATT RATEN / IDEMPOTENT: Jedes UPDATE ist doppelt abgesichert — per
--   1) exakter dealer.id (bei der Inspektion eindeutig ermittelt, je 1 Treffer) UND
--   2) exaktem ALTEN (falschen) Wert in der WHERE-Bedingung.
-- Ein zweiter Lauf trifft nichts mehr (der alte Wert existiert dann nicht mehr) —
-- 0 Zeilen, kein Schaden. Wird die Adresse vorher anderweitig korrigiert, greift
-- das UPDATE ebenfalls nicht (kein Ueberschreiben).
--
-- WAECHTER: nur diese 6 Datensaetze, nur Adressfelder (Strasse bzw. Ort). Keine
-- anderen Haendlerdaten, keine Belege, keine Logik. NICHT AUTOMATISCH ANWENDEN
-- (Supabase SQL Editor, Projekt wyddahfnxiilootylcwg).
-- ============================================================================

-- 1) Gut Oggau - Tscheppe GmbH: "Hautpstraße 31" -> "Hauptstraße 31"
--    (identisch in store/shipping/billing)
update dealers set
  store_street    = 'Hauptstraße 31',
  shipping_street = 'Hauptstraße 31',
  billing_street  = 'Hauptstraße 31'
where id = '07360cbb-818e-4f2d-8e68-73b40a975e7b'
  and store_street    = 'Hautpstraße 31'
  and shipping_street = 'Hautpstraße 31'
  and billing_street  = 'Hautpstraße 31';

-- 2) M. Bujatti GmbH: "Marc-Aurel-Strase 5" -> "Marc-Aurel-Straße 5"
--    NUR store_street (shipping/billing = "Webereistr. 9, Pottschach" = andere,
--    korrekte Adresse, bleibt unberuehrt).
update dealers set
  store_street = 'Marc-Aurel-Straße 5'
where id = 'e4f8cb2d-cbf1-4410-8127-ec6197a01a84'
  and store_street = 'Marc-Aurel-Strase 5';

-- 3) WALSER / Fashion & Lifestyle GmbH: "Radetzkeystr. 114" -> "Radetzkystraße 114"
update dealers set
  store_street    = 'Radetzkystraße 114',
  shipping_street = 'Radetzkystraße 114',
  billing_street  = 'Radetzkystraße 114'
where id = '15dc50a4-e2db-4c37-88b2-d93480d72009'
  and store_street    = 'Radetzkeystr. 114'
  and shipping_street = 'Radetzkeystr. 114'
  and billing_street  = 'Radetzkeystr. 114';

-- 4) Mode & Sport MOREAU Ges.m.b.H.: "Willhelm-Fazokas-Strasse 16" -> "Wilhelm-Fazokas-Straße 16"
update dealers set
  store_street    = 'Wilhelm-Fazokas-Straße 16',
  shipping_street = 'Wilhelm-Fazokas-Straße 16',
  billing_street  = 'Wilhelm-Fazokas-Straße 16'
where id = '4f020b2f-d258-4b6a-bfcd-9d7fd4417f20'
  and store_street    = 'Willhelm-Fazokas-Strasse 16'
  and shipping_street = 'Willhelm-Fazokas-Strasse 16'
  and billing_street  = 'Willhelm-Fazokas-Strasse 16';

-- 5) Schloss Elmau GmbH & Co. KG: "In Elmai 2" -> "In Elmau 2"
update dealers set
  store_street    = 'In Elmau 2',
  shipping_street = 'In Elmau 2',
  billing_street  = 'In Elmau 2'
where id = '924df75e-5a6c-4cb1-aa58-3a47995db6e0'
  and store_street    = 'In Elmai 2'
  and shipping_street = 'In Elmai 2'
  and billing_street  = 'In Elmai 2';

-- 6) Romy Walcher: Ort "Atnet" -> "Adnet" (Strasse "Wimberg 252" bleibt)
update dealers set
  store_city    = 'Adnet',
  shipping_city = 'Adnet',
  billing_city  = 'Adnet'
where id = 'abb6ba41-0e4d-4fb7-8dec-11a4e062efec'
  and store_city    = 'Atnet'
  and shipping_city = 'Atnet'
  and billing_city  = 'Atnet';
