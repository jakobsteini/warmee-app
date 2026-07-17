-- ============================================================================
-- HÄNDLER-MODUL ERWEITERN
-- Baustein „Händler-Modul erweitern" (2026-07-17). Deckt drei Schema-Punkte ab:
--   P1  E-Mail-Rolle „Einkauf" (purchasing) für dealer_emails
--   P3  Name der Lieferadresse (dealers.shipping_name)
--   P4  Alias-Namen je Händler (neue Tabelle dealer_aliases)
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, dealers, dealer_emails
-- sowie auth_org_id() bestehen bereits.
--
-- Echtdaten-safe: keine bestehende Zeile wird ungültig. shipping_name ist
-- nullable; die Rollen-Erweiterung WEITET nur den erlaubten Wertebereich (kann
-- keine der bestehenden dealer_emails-Zeilen verletzen); dealer_aliases ist neu.
--
-- Zur „kein DROP"-Regel: Punkt P1 muss den CHECK-Constraint per DROP+ADD
-- ersetzen, weil Postgres einen erlaubten Wert nicht additiv ergänzen kann. Das
-- ist bewusst und mit Jakob abgestimmt — es erweitert nur die erlaubten Werte,
-- Bestandsdaten bleiben gültig. Ansonsten rein additiv/idempotent.
-- ============================================================================


-- ─── P3  Name der Lieferadresse ─────────────────────────────────────────────
-- Rechnungs- und Store-Adresse haben bereits billing_name/store_name; die
-- Lieferadresse bekommt symmetrisch shipping_name (nullable = nicht gepflegt).
alter table dealers
  add column if not exists shipping_name text;


-- ─── P1  E-Mail-Rolle „Einkauf" (purchasing) ────────────────────────────────
-- Vierte Rolle im bestehenden Rollen-Muster von dealer_emails. Der Constraint
-- wurde inline in CREATE TABLE angelegt und heißt daher standardmäßig
-- dealer_emails_role_check. Wir ersetzen ihn durch die um 'purchasing'
-- erweiterte Variante. drop-if-exists + add ist bei erneutem Lauf idempotent.
alter table dealer_emails
  drop constraint if exists dealer_emails_role_check;

alter table dealer_emails
  add constraint dealer_emails_role_check
  check (role in ('order_confirmation', 'invoice', 'delivery', 'purchasing'));


-- ─── P4  Alias-Namen je Händler ─────────────────────────────────────────────
-- Alternative Namen/Schreibweisen eines Händlers; mehrere je Händler möglich.
-- Die Freitextsuche in der Händlerliste findet sie mit. org_id + RLS wie der
-- Rest; kein Seed (wird über die UI gepflegt).
create table if not exists dealer_aliases (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  dealer_id   uuid not null references dealers(id) on delete cascade,
  alias       text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_dealer_aliases_dealer on dealer_aliases(dealer_id);
create index if not exists idx_dealer_aliases_org    on dealer_aliases(org_id);

-- Denselben Alias nicht doppelt je Händler (case-insensitiv, passend zur
-- App-seitigen Doubletten-Prüfung).
create unique index if not exists uq_dealer_aliases_dealer_alias
  on dealer_aliases (dealer_id, lower(alias));

alter table dealer_aliases enable row level security;

create policy "dealer_aliases_select" on dealer_aliases for select using (org_id = auth_org_id());
create policy "dealer_aliases_insert" on dealer_aliases for insert with check (org_id = auth_org_id());
create policy "dealer_aliases_update" on dealer_aliases for update using (org_id = auth_org_id());
create policy "dealer_aliases_delete" on dealer_aliases for delete using (org_id = auth_org_id());
