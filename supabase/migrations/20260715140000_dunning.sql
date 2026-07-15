-- ============================================================================
-- MAHNWESEN — Mahnstufen-Konfiguration & Mahnhistorie
-- Quelle: Systemanforderungen WARM ME, Abschnitt 8.2 (Mahnwesen).
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, invoices, profiles sowie
-- auth_org_id() und update_updated_at() bestehen bereits.
--
-- SCOPE: Nur Konfiguration der Stufen + Historie. KEIN Mailversand, keine
-- Templates, kein PDF (E-Mail/DNS für warm-me.com ungeklärt).
--
-- REIN ADDITIV: nur CREATE TABLE / CREATE INDEX / INSERT-Seed. Kein DROP, kein
-- RENAME, kein Typwechsel, keine bestehende Spalte verändert. Idempotent.
-- Multi-Tenant: beide Tabellen mit org_id + denselben RLS-Policies wie der Rest
-- (org_id = auth_org_id()); org_id wird app-seitig beim Insert gesetzt.
--
-- Fachlich zentral:
--   * Anzahl, Bezeichnung, Tage-Abstand und Gebühr sind KONFIGURIERBAR
--     (dunning_levels) — nichts davon steht hart im Code.
--   * Die „erreichte Stufe" einer Rechnung wird NICHT gespeichert, sondern live
--     aus (Tage überfällig) gegen die konfigurierten Schwellen abgeleitet — so
--     wirkt eine geänderte Konfiguration sofort auf die Übersicht, ohne dass
--     bestehende Datensätze nachgezogen werden müssen. Überfälligkeit kommt aus
--     DERSELBEN Logik wie die Offene-Posten-Liste (kein zweiter Rechenweg).
--   * Die Mahnhistorie (dunning_history) hält fest, welche Stufe wann für eine
--     Rechnung tatsächlich GESETZT wurde (später beim Versand). Label und Gebühr
--     werden dabei EINGEFROREN (Snapshot), damit spätere Konfig-Änderungen die
--     dokumentierte Historie nicht rückwirkend verändern — analog zur
--     eingefrorenen rate_percent bei den Provisionsabrechnungen.
-- ============================================================================


-- ─── (a) Mahnstufen-Konfiguration (konfigurierbar, je Org mehrere Stufen) ────
-- level_number = Reihenfolge/Nummer (1, 2, 3 …), eindeutig je Org.
-- days_after_due = ab wie vielen Tagen NACH Fälligkeit die Stufe greift.
-- fee = Mahngebühr (Default 0). triggers_collection = löst Inkasso aus (ja/nein).
create table if not exists dunning_levels (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organizations(id),
  level_number        integer not null check (level_number >= 1),
  label               text not null,
  days_after_due      integer not null check (days_after_due >= 0),
  fee                 numeric(10,2) not null default 0 check (fee >= 0),
  triggers_collection boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (org_id, level_number)
);

create index if not exists idx_dunning_levels_org on dunning_levels(org_id);

alter table dunning_levels enable row level security;

create policy "dunning_levels_select" on dunning_levels for select using (org_id = auth_org_id());
create policy "dunning_levels_insert" on dunning_levels for insert with check (org_id = auth_org_id());
create policy "dunning_levels_update" on dunning_levels for update using (org_id = auth_org_id());
create policy "dunning_levels_delete" on dunning_levels for delete using (org_id = auth_org_id());

create trigger trg_dunning_levels_updated before update on dunning_levels
  for each row execute function update_updated_at();

-- Seed passend zur Vorgabe der Kundin: DREI Stufen, alle OHNE Gebühr, Stufe 3
-- löst Inkasso aus. Die TAGE-ABSTÄNDE sind VORSCHLAGSWERTE (von der Kundin NICHT
-- vorgegeben) und über die Einstellungsseite jederzeit änderbar:
--   Stufe 1 — Zahlungserinnerung, 14 Tage nach Fälligkeit
--   Stufe 2 — 2. Mahnung,         30 Tage nach Fälligkeit
--   Stufe 3 — 3. Mahnung / Inkasso, 45 Tage nach Fälligkeit
-- Idempotent: bereits konfigurierte Orgs (level 1/2/3 vorhanden) werden nicht
-- überschrieben.
insert into dunning_levels (org_id, level_number, label, days_after_due, fee, triggers_collection)
select o.id, v.level_number, v.label, v.days_after_due, 0, v.triggers_collection
from organizations o
cross join (values
  (1, 'Zahlungserinnerung', 14, false),
  (2, '2. Mahnung',         30, false),
  (3, '3. Mahnung',         45, true)
) as v(level_number, label, days_after_due, triggers_collection)
on conflict (org_id, level_number) do nothing;


-- ─── (b) Mahnhistorie (je Rechnung: welche Stufe wann gesetzt) ──────────────
-- reached_at = Tag, an dem die Stufe gesetzt/erreicht wurde. label_snapshot und
-- fee_snapshot frieren die Konfiguration zum Zeitpunkt des Setzens ein, damit
-- spätere Änderungen an dunning_levels die Historie nicht verfälschen.
-- Eine Zeile je (Rechnung, Stufe): dieselbe Stufe wird nicht doppelt vermerkt.
create table if not exists dunning_history (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id),
  invoice_id     uuid not null references invoices(id) on delete cascade,
  level_number   integer not null check (level_number >= 1),
  label_snapshot text not null,
  fee_snapshot   numeric(10,2) not null default 0,
  reached_at     date not null default current_date,
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz default now(),
  unique (invoice_id, level_number)
);

create index if not exists idx_dunning_history_org     on dunning_history(org_id);
create index if not exists idx_dunning_history_invoice on dunning_history(invoice_id);

alter table dunning_history enable row level security;

create policy "dunning_history_select" on dunning_history for select using (org_id = auth_org_id());
create policy "dunning_history_insert" on dunning_history for insert with check (org_id = auth_org_id());
create policy "dunning_history_update" on dunning_history for update using (org_id = auth_org_id());
create policy "dunning_history_delete" on dunning_history for delete using (org_id = auth_org_id());
