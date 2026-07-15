-- ============================================================================
-- PROVISIONSABRECHNUNG
-- Quelle: Systemanforderungen WARM ME, Abschnitt 10 + 2.2 (Zuteilung als
-- Pflichtfeld bei der Ordererfassung).
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, orders, seasons,
-- profiles sowie auth_org_id() und update_updated_at() bestehen.
--
-- REIN ADDITIV: nur ADD COLUMN / CREATE TABLE / CREATE INDEX / INSERT-Seed.
-- Kein DROP, kein RENAME, kein Typwechsel an bestehenden Spalten.
-- Echtdaten-safe: bestehende Orders bekommen die Zuteilung 'internal' (keine
-- rückwirkend erfundene Provisionslast für die Agentin).
--
-- Fachlich zentral:
--   * Provision basiert auf der ZUTEILUNG je Order (agent | internal), NICHT
--     auf dem Land des Händlers.
--   * Provisions-Basis ist der TATSÄCHLICH EINGEGANGENE Betrag (invoices.
--     paid_amount), nicht der Orderbetrag und nicht die gestellte Rechnung.
--   * Retouren/Gutschriften existieren im System noch NICHT (eigener Baustein).
--     Hier bereits als eigene Betragsstufe `deductions` vorgesehen, die AKTUELL
--     immer 0 ist — kein Platzhalter, der falsche Zahlen liefert, keine
--     erfundene Retouren-Tabelle.
--   * Die Provisionsrate ist editierbar (commission_settings) und wird beim
--     Erstellen einer Abrechnung EINGEFROREN (rate_percent auf der Abrechnung),
--     damit spätere Ratenänderungen abgerechnete Provisionen nicht verändern.
-- ============================================================================


-- ─── (3a) Zuteilung je Order ────────────────────────────────────────────────
-- agent    = der deutschen Agentin zugeteilt (provisionsrelevant)
-- internal = WARM ME intern (keine Provision)
-- NOT NULL DEFAULT 'internal' füllt alle Bestands-Orders in einem Schritt.
-- Neue Orders setzen den Wert explizit (Pflichtfeld im UI); der Default ist
-- nur Absicherung.
alter table orders
  add column if not exists assignment text not null default 'internal'
    check (assignment in ('agent', 'internal'));

create index if not exists idx_orders_assignment on orders(assignment);


-- ─── (3b) Editierbare aktuelle Provisionsrate (eine Zeile je Org) ───────────
create table if not exists commission_settings (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organizations(id),
  commission_percent  numeric(5,2) not null default 15
    check (commission_percent >= 0 and commission_percent <= 100),
  updated_at          timestamptz default now(),
  unique (org_id)
);

alter table commission_settings enable row level security;

create policy "commission_settings_select" on commission_settings for select using (org_id = auth_org_id());
create policy "commission_settings_insert" on commission_settings for insert with check (org_id = auth_org_id());
create policy "commission_settings_update" on commission_settings for update using (org_id = auth_org_id());

create trigger trg_commission_settings_updated before update on commission_settings
  for each row execute function update_updated_at();

-- Startwert 15 % je bestehender Organisation (idempotent).
insert into commission_settings (org_id, commission_percent)
select id, 15 from organizations
on conflict (org_id) do nothing;


-- ─── (3c) Provisionsabrechnung als Dokument (eingefrorener Snapshot) ─────────
-- Bezug auf Saison + Zeitraum. rate_percent und die berechneten Beträge werden
-- beim Erstellen festgeschrieben (eingefroren) und später nicht neu berechnet.
--   gross_received    = Summe der tatsächlich eingegangenen Beträge (Basis)
--   deductions        = Retouren/Gutschriften — AKTUELL immer 0 (eigener Baustein)
--   net_base          = gross_received - deductions
--   commission_amount = net_base * rate_percent / 100  (eingefroren)
create table if not exists commission_settlements (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references organizations(id),
  season_id          uuid not null references seasons(id),
  assignment         text not null default 'agent'
    check (assignment in ('agent', 'internal')),
  period_from        date not null,
  period_to          date not null,
  rate_percent       numeric(5,2)  not null,
  gross_received     numeric(12,2) not null default 0,
  deductions         numeric(12,2) not null default 0,
  net_base           numeric(12,2) not null default 0,
  commission_amount  numeric(12,2) not null default 0,
  notes              text,
  created_by         uuid references profiles(id),
  created_at         timestamptz default now()
);

create index if not exists idx_commission_settlements_org    on commission_settlements(org_id);
create index if not exists idx_commission_settlements_season on commission_settlements(season_id);

alter table commission_settlements enable row level security;

create policy "commission_settlements_select" on commission_settlements for select using (org_id = auth_org_id());
create policy "commission_settlements_insert" on commission_settlements for insert with check (org_id = auth_org_id());
create policy "commission_settlements_update" on commission_settlements for update using (org_id = auth_org_id());
create policy "commission_settlements_delete" on commission_settlements for delete using (org_id = auth_org_id());
