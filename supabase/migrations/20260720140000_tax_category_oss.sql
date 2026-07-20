-- ============================================================================
-- STEUERKATEGORIE-FUNDAMENT (Thema 3, Teil 1): Datenmodell + OSS-Ländertabelle
-- Baustein B4a (2026-07-20). Legt die Stammdaten-/Snapshot-Felder für die
-- spätere MwSt-Logik an — OHNE die Rechnungserzeugung umzustellen (das ist der
-- letzte Teil-Baustein). Der Rechenkern (taxCalc.ts), das Kunden-UI, das OSS-UI
-- und das Einhängen in Order/Rechnung folgen als eigene Schritte.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS / CREATE POLICY / INSERT … WHERE NOT EXISTS. Kein DROP, kein RENAME,
-- kein Typwechsel, keine bestehende Spalte/Policy verändert. Die Echtdaten (128
-- Händler, bestehende Rechnungen) bleiben gültig:
--   * customer_group und uid bleiben UNANGETASTET (existieren bereits).
--   * alle neuen dealers-/invoices-Spalten sind nullable bzw. haben einen Default
--     → bestehende Zeilen bleiben gültig, starten leer/false.
--   * bestehende invoices behalten ihren eingefrorenen tax_rate/tax_amount; die
--     neuen Snapshot-Spalten (tax_note/tax_category) starten NULL → Altbelege
--     zeigen weiterhin nur ihren Satz ohne Hinweis (siehe pdf.ts-Änderung).
--
-- Voraussetzung: organizations, dealers, invoices sowie auth_org_id() bestehen.
--
-- Fachliche Entscheidungen (mit Jakob abgestimmt):
--   * language      — Belegsprache 'de'|'en', nullable (App-Fallback 'de').
--   * country_iso2  — sauberes ISO2-Land für die EU/Drittland-Ableitung. Wird
--     NICHT per Massen-Skript befüllt: die Normalisierung der Bestandshändler
--     passiert im Kunden-UI beim nächsten Bearbeiten (kein Backfill-Raten aus dem
--     unsauberen bestehenden country/country_code).
--   * uid_verified  — manuelles „UID geprüft"-Flag (offline-Prüfung, KEIN Live-
--     VIES). default false.
--   * oss_country_rates — pflegbare OSS-Sätze je EU-Land (nur B2C). Seed unten.
--   * invoices.tax_note / tax_category — Snapshot-Felder, werden ERST beim
--     späteren Einhängen befüllt; hier nur angelegt.
-- ============================================================================


-- ─── 1) dealers: Belegsprache / ISO2-Land / UID-geprüft ─────────────────────
alter table dealers
  add column if not exists language     text,
  add column if not exists country_iso2 text,
  add column if not exists uid_verified boolean not null default false;


-- ─── 2) invoices: Steuer-Snapshot (Pflichthinweis + Kategorie) ──────────────
-- Beide nullable → bestehende Rechnungen starten NULL. tax_rate/tax_amount/total
-- (Snapshot) existieren bereits und bleiben unberührt.
alter table invoices
  add column if not exists tax_note     text,
  add column if not exists tax_category text;


-- ─── 3) OSS-Ländertabelle (pflegbar, nur B2C) ───────────────────────────────
-- vat_rate als FAKTOR gespeichert (0.19 = 19 %), konsistent zu invoices.tax_rate
-- und tax.ts (VAT_RATE = 0.20). Eindeutig je (org, Land).
create table if not exists oss_country_rates (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  country_iso2  text not null,
  country_name  text not null,
  vat_rate      numeric(5,4) not null,
  active        boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (org_id, country_iso2)
);

create index if not exists idx_oss_rates_org on oss_country_rates(org_id);

alter table oss_country_rates enable row level security;

create policy "oss_rates_select" on oss_country_rates for select using (org_id = auth_org_id());
create policy "oss_rates_insert" on oss_country_rates for insert with check (org_id = auth_org_id());
create policy "oss_rates_update" on oss_country_rates for update using (org_id = auth_org_id());
create policy "oss_rates_delete" on oss_country_rates for delete using (org_id = auth_org_id());

create trigger trg_oss_rates_updated before update on oss_country_rates
  for each row execute function update_updated_at();


-- ─── 4) Seed: EU-Regelsteuersätze (Stand 2026, als Faktor) ──────────────────
-- org_id NICHT hardcodiert: aus einer bestehenden dealers-Zeile abgeleitet (alle
-- Händler gehören zur WARM-ME-Org). WHERE NOT EXISTS je (org, Land) → idempotent.
-- Nur EU-Mitgliedstaaten (OSS greift nur innergemeinschaftlich, nur B2C). AT ist
-- bewusst NICHT geseedet — Inland läuft über den Regelsatz (tax.ts), nicht OSS.
insert into oss_country_rates (org_id, country_iso2, country_name, vat_rate)
select d.org_id, v.iso2, v.name, v.rate
from (select org_id from dealers limit 1) d
cross join (values
  ('BE', 'Belgien',        0.2100),
  ('BG', 'Bulgarien',      0.2000),
  ('HR', 'Kroatien',       0.2500),
  ('CY', 'Zypern',         0.1900),
  ('CZ', 'Tschechien',     0.2100),
  ('DK', 'Dänemark',       0.2500),
  ('EE', 'Estland',        0.2200),
  ('FI', 'Finnland',       0.2550),
  ('FR', 'Frankreich',     0.2000),
  ('DE', 'Deutschland',    0.1900),
  ('GR', 'Griechenland',   0.2400),
  ('HU', 'Ungarn',         0.2700),
  ('IE', 'Irland',         0.2300),
  ('IT', 'Italien',        0.2200),
  ('LV', 'Lettland',       0.2100),
  ('LT', 'Litauen',        0.2100),
  ('LU', 'Luxemburg',      0.1700),
  ('MT', 'Malta',          0.1800),
  ('NL', 'Niederlande',    0.2100),
  ('PL', 'Polen',          0.2300),
  ('PT', 'Portugal',       0.2300),
  ('RO', 'Rumänien',       0.1900),
  ('SK', 'Slowakei',       0.2300),
  ('SI', 'Slowenien',      0.2200),
  ('ES', 'Spanien',        0.2100),
  ('SE', 'Schweden',       0.2500)
) as v(iso2, name, rate)
where not exists (
  select 1 from oss_country_rates o
  where o.org_id = d.org_id and o.country_iso2 = v.iso2
);
