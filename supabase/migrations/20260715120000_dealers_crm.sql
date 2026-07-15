-- ============================================================================
-- KUNDEN-STAMMDATEN (HÄNDLER) ERWEITERN
-- Grundlage für Provision, AB-/Rechnungsversand und Mahnwesen.
-- Quelle: Systemanforderungen WARM ME, Abschnitt 12 (Kundenverwaltung) + 2.2/2.3.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, dealers, seasons sowie
-- auth_org_id() bestehen bereits.
--
-- REIN ADDITIV: nur ADD COLUMN / ALTER DEFAULT / CREATE TABLE / CREATE INDEX /
-- INSERT (Seed). Kein DROP, kein RENAME, kein Typwechsel an bestehenden Spalten.
-- Echtdaten-safe: die 128 bestehenden Händler bleiben gültig — neue Spalten sind
-- entweder nullable oder haben einen sinnvollen Default; bestehende E-Mail-Felder
-- werden NUR kopiert (Seed), nie verändert oder gelöscht.
--
-- Multi-Tenant: alle neuen Tabellen bekommen org_id + dieselben RLS-Policies wie
-- der Rest (org_id = auth_org_id()). org_id wird app-seitig beim Insert gesetzt.
-- ============================================================================


-- ─── (c) Fehlende Stammdaten-Felder an dealers ──────────────────────────────
-- Kundengruppe B2B/B2C: NOT NULL mit Default 'b2b' (Fachhandel ist überwiegend
-- B2B) → alle bestehenden Händler werden automatisch 'b2b'.
-- Individueller Rabatt: Prozent, NOT NULL DEFAULT 0 (nie NULL, damit spätere
-- Berechnungen nicht auf NULL laufen). Nur Vorschlagswert des Händlers — das je
-- Order überschreibbare Rabatt-Feld (Abschnitt 2.2) ist NICHT Teil dieser Migration.
-- Kreditlimit: nullable = "kein Limit hinterlegt".
alter table dealers
  add column if not exists customer_group   text not null default 'b2b'
    check (customer_group in ('b2b', 'b2c')),
  add column if not exists discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  add column if not exists credit_limit     numeric(10,2);

-- Zahlungsziel: Spalte existiert bereits, hatte aber KEINEN DB-Default (die
-- "30 Tage netto" lebten nur im App-Code). Default jetzt in der DB verankern und
-- bestehende NULLs auf den Hausstandard 30 heben. Bleibt nullable (das Formular
-- darf das Feld leer lassen; der App-Fallback rechnet dann weiterhin mit 30).
alter table dealers
  alter column zahlungsziel_tage set default 30;

update dealers
  set zahlungsziel_tage = 30
  where zahlungsziel_tage is null;


-- ─── (a) Mehrere E-Mail-Adressen je Händler mit Zuständigkeit ───────────────
-- Rollen (englisch/snake_case in der DB; UI-Labels via i18n):
--   order_confirmation = Auftragsbestätigung
--   invoice            = Rechnung
--   delivery           = Lager / Lieferschein
-- Eine Zeile je (Händler, Adresse, Rolle):
--   • pro Rolle mehrere Adressen  → mehrere Zeilen mit gleicher role
--   • eine Adresse für mehrere Rollen → mehrere Zeilen mit gleicher email
create table if not exists dealer_emails (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  dealer_id   uuid not null references dealers(id) on delete cascade,
  email       text not null,
  role        text not null
    check (role in ('order_confirmation', 'invoice', 'delivery')),
  created_at  timestamptz default now(),
  -- Dieselbe Adresse nicht zweimal für dieselbe Rolle desselben Händlers.
  unique (dealer_id, email, role)
);

create index if not exists idx_dealer_emails_dealer on dealer_emails(dealer_id);
create index if not exists idx_dealer_emails_org    on dealer_emails(org_id);

alter table dealer_emails enable row level security;

create policy "dealer_emails_select" on dealer_emails for select using (org_id = auth_org_id());
create policy "dealer_emails_insert" on dealer_emails for insert with check (org_id = auth_org_id());
create policy "dealer_emails_update" on dealer_emails for update using (org_id = auth_org_id());
create policy "dealer_emails_delete" on dealer_emails for delete using (org_id = auth_org_id());

-- Seed aus den bestehenden adressgebundenen E-Mail-Feldern (nur kopieren, die
-- Original-Spalten bleiben unangetastet). Nur plausible Adressen (enthält '@'),
-- getrimmt; Doubletten werden über den Unique-Index verworfen.
--   Haupt-email        → order_confirmation (Auftragsbestätigung)
--   billing_email      → invoice            (Rechnung)
--   shipping_email(+2) → delivery           (Lager / Lieferschein)
insert into dealer_emails (org_id, dealer_id, email, role)
select d.org_id, d.id, trim(d.email), 'order_confirmation'
  from dealers d
 where d.email is not null and position('@' in d.email) > 0
on conflict (dealer_id, email, role) do nothing;

insert into dealer_emails (org_id, dealer_id, email, role)
select d.org_id, d.id, trim(d.billing_email), 'invoice'
  from dealers d
 where d.billing_email is not null and position('@' in d.billing_email) > 0
on conflict (dealer_id, email, role) do nothing;

insert into dealer_emails (org_id, dealer_id, email, role)
select d.org_id, d.id, trim(d.shipping_email), 'delivery'
  from dealers d
 where d.shipping_email is not null and position('@' in d.shipping_email) > 0
on conflict (dealer_id, email, role) do nothing;

insert into dealer_emails (org_id, dealer_id, email, role)
select d.org_id, d.id, trim(d.shipping_email2), 'delivery'
  from dealers d
 where d.shipping_email2 is not null and position('@' in d.shipping_email2) > 0
on conflict (dealer_id, email, role) do nothing;


-- ─── (b) Priorität je Händler PRO SAISON ────────────────────────────────────
-- Wird später für die Warenverteilung gebraucht, wenn nicht alle Orders
-- vollständig beliefert werden können. priority: kleiner = höher (1 vor 2 vor 3),
-- konsistent zu producers.priority. Genau eine Priorität je (Händler, Saison).
-- Kein Seed — wird über die UI je Saison gepflegt.
create table if not exists dealer_season_priority (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  dealer_id   uuid not null references dealers(id) on delete cascade,
  season_id   uuid not null references seasons(id) on delete cascade,
  priority    integer not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (dealer_id, season_id)
);

create index if not exists idx_dsp_dealer on dealer_season_priority(dealer_id);
create index if not exists idx_dsp_season on dealer_season_priority(season_id);
create index if not exists idx_dsp_org    on dealer_season_priority(org_id);

alter table dealer_season_priority enable row level security;

create policy "dsp_select" on dealer_season_priority for select using (org_id = auth_org_id());
create policy "dsp_insert" on dealer_season_priority for insert with check (org_id = auth_org_id());
create policy "dsp_update" on dealer_season_priority for update using (org_id = auth_org_id());
create policy "dsp_delete" on dealer_season_priority for delete using (org_id = auth_org_id());
