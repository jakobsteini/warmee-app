-- ============================================================================
-- Praezise Haendler-Koordinaten fuer die Standort-Umkreissuche (Handy).
--
-- HINTERGRUND: Die bestehende Umkreissuche verortet Haendler ueber PLZ-Zentroide
-- (plz_coordinates, GeoNames). In Grossstaedten liegen alle Bezirks-PLZ auf EINEM
-- Punkt -> alle Wien-Haendler = 0 km. Fuer 1-10 km innerstaedtisch zu grob.
-- Deshalb bekommt jeder Haendler optional eine echte Adress-Koordinate.
--
-- BEFUELLT WIRD DAS NICHT HIER, sondern EINMALIG und MANUELL ueber das Skript
-- scripts/geocodeDealers.ts (Nominatim/OpenStreetMap). Nie automatisch im Betrieb.
-- Haendler ohne aufloesbare Adresse bleiben lat/lng = NULL -> die Distanzberechnung
-- faellt fuer sie auf den PLZ-Zentroid zurueck ("ungefaehr").
--
-- REIN ADDITIV & idempotent: nur ADD COLUMN IF NOT EXISTS. Kein DROP/RENAME,
-- kein Typwechsel an bestehenden Spalten. NICHT AUTOMATISCH ANWENDEN
-- (Supabase SQL Editor, Projekt wyddahfnxiilootylcwg).
-- ============================================================================

alter table dealers
  add column if not exists lat            numeric,
  add column if not exists lng            numeric,
  add column if not exists geocoded_at    timestamptz,
  add column if not exists geocode_source text;

comment on column dealers.lat is 'Breitengrad der Ladenadresse (Dezimalgrad, WGS84). NULL = nicht geokodiert -> Fallback PLZ-Zentroid.';
comment on column dealers.lng is 'Laengengrad der Ladenadresse (Dezimalgrad, WGS84). NULL = nicht geokodiert -> Fallback PLZ-Zentroid.';
comment on column dealers.geocoded_at is 'Zeitpunkt der letzten Geokodierung (scripts/geocodeDealers.ts).';
comment on column dealers.geocode_source is 'Quelle der Koordinate, z. B. "nominatim". Attribution/Nachvollziehbarkeit.';
