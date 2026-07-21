-- ============================================================================
-- ARTIKEL-GRUPPEN für Auswertungen (offene Liste, kein Enum)
-- Kundenentscheidung: Gruppen orientieren sich an dem, was schon existiert; die
-- Mitarbeiter können zusätzlich neue Gruppen selbst anlegen.
--
-- Befund: Artikel haben bereits ein freies Textfeld products.category (bekannte
-- Werte hat/sweater/scarf/cardigan, kein DB-CHECK). Daraus wird der Startbestand
-- der Gruppen abgeleitet. products.category BLEIBT unverändert erhalten (kein
-- stiller Datenverlust) — group_id kommt additiv dazu.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- CREATE TABLE/INDEX/POLICY IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, Seed per
-- ON CONFLICT DO NOTHING und UPDATE nur dort, wo group_id noch NULL ist. Kein
-- DROP, kein RENAME, kein Typwechsel. Echtdaten bleiben gültig.
--
-- Multi-Tenant: article_groups bekommt org_id + dieselben RLS-Policies wie der
-- Rest (org_id = auth_org_id()).
--
-- Voraussetzung: organizations, products sowie auth_org_id() bestehen.
-- ============================================================================

-- ─── 1) Gruppen-Stammtabelle ────────────────────────────────────────────────
create table if not exists article_groups (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references organizations(id),
  name       text not null,
  created_at timestamptz default now(),
  -- Kein doppelter Gruppenname je Org (Backstop zur App-Validierung).
  unique (org_id, name)
);

create index if not exists idx_article_groups_org on article_groups(org_id);

alter table article_groups enable row level security;

create policy "article_groups_select" on article_groups for select using (org_id = auth_org_id());
create policy "article_groups_insert" on article_groups for insert with check (org_id = auth_org_id());
create policy "article_groups_update" on article_groups for update using (org_id = auth_org_id());
create policy "article_groups_delete" on article_groups for delete using (org_id = auth_org_id());

-- ─── 2) products.group_id — nullable FK auf article_groups ──────────────────
-- Nullable, kein Default: Artikel ohne ableitbare Gruppe behalten group_id NULL.
-- Die neue Spalte unterliegt automatisch den bestehenden RLS-Policies von products.
alter table products
  add column if not exists group_id uuid references article_groups(id);

create index if not exists idx_products_group on products(group_id);

-- ─── 3) Startbestand aus den vorhandenen distinct category-Werten ───────────
-- Je Org ein Gruppen-Datensatz je vorkommendem category-Wert (getrimmt). category
-- bleibt erhalten. ON CONFLICT macht den Seed idempotent.
insert into article_groups (org_id, name)
select distinct p.org_id, trim(p.category)
from products p
where p.category is not null and trim(p.category) <> ''
on conflict (org_id, name) do nothing;

-- Artikel auf die passende (org-lokale) Gruppe mappen — nur wo group_id noch NULL
-- ist (idempotent, überschreibt keine spätere manuelle Zuordnung).
update products p
set group_id = g.id
from article_groups g
where p.group_id is null
  and p.category is not null and trim(p.category) <> ''
  and g.org_id = p.org_id
  and g.name = trim(p.category);
