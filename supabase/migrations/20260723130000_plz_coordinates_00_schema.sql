-- ============================================================================
-- PLZ -> Koordinaten (AT + DE + CH) fuer die Umkreissuche Haendler.
--
-- GLOBALE Referenz-/Geodaten (KEIN org_id): oeffentliche Postleitzahl-Zentroide,
-- nicht mandantenbesitz. Die Mandanten-Trennung passiert auf der dealers-Abfrage
-- (RLS). Bewusste, begruendete Abweichung von "org_id auf jeder Tabelle" — es
-- handelt sich um geteilte Nachschlagedaten (wie ein oeffentliches Verzeichnis).
--
-- Quelle: GeoNames (https://download.geonames.org/export/zip/, Lizenz CC BY 4.0).
-- Je (Land, PLZ) EIN Zentroid (Mittel der GeoNames-Ortspunkte) + ein
-- repraesentativer Ortsname. 16676 Zeilen.
--
-- REIN ADDITIV & idempotent: CREATE TABLE/INDEX/POLICY IF NOT EXISTS, Seed per
-- ON CONFLICT DO NOTHING. Kein DROP/RENAME. NICHT AUTOMATISCH ANWENDEN.
-- AUFGETEILT: dieses Schema zuerst, danach die Daten-Dateien _01.._NN in
-- Reihenfolge (jede fuer sich idempotent, ON CONFLICT DO NOTHING).
-- ============================================================================

create table if not exists plz_coordinates (
  country_code text not null,
  plz          text not null,
  place        text,
  lat          double precision not null,
  lng          double precision not null,
  primary key (country_code, plz)
);

create index if not exists idx_plz_coordinates_plz on plz_coordinates (plz);

alter table plz_coordinates enable row level security;

-- Reine Lesedaten: jede/r Authentifizierte darf lesen; kein Schreibpfad in der App.
drop policy if exists "plz_coordinates_select" on plz_coordinates;
create policy "plz_coordinates_select" on plz_coordinates
  for select to authenticated using (true);
