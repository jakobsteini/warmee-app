-- ============================================================================
-- PRODUZENTEN generalisieren (Nepal → mehrere Produzenten, z. B. + Portugal)
--
-- Der Produktions-Flow war implizit auf einen einzigen Produzenten (Nepal)
-- verdrahtet. Diese Migration führt echte Produzenten-Stammdaten ein und
-- verknüpft die Produktionsbestellung damit. Die Priorisierungs-Logik und die
-- Portugal-UI kommen später — das Datenmodell kann aber ab jetzt mehrere
-- Produzenten (inkl. Priorität) abbilden.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor / Management API,
-- Projekt wyddahfnxiilootylcwg) — sie wird später gebündelt mit den anderen
-- offenen Migrationen angewendet. Voraussetzung: organizations,
-- production_orders sowie auth_org_id() bestehen.
--
-- REIN ADDITIV: CREATE TABLE / ADD COLUMN / CREATE INDEX. Kein DROP, kein
-- RENAME, kein Typwechsel an bestehenden Spalten. producer_id ist nullable —
-- bestehende Produktionsbestellungen bleiben gültig (Zuordnung erfolgt später).
-- Multi-Tenant: producers bekommt org_id + dieselben RLS-Policies wie der Rest.
-- Kein Seed — Produzenten werden später (UI/Import) angelegt.
-- ============================================================================

-- ─── Produzenten-Stammdaten ─────────────────────────────────────────────────
create table if not exists producers (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  name        text not null,
  -- Land des Produzenten, z. B. 'NP' (Nepal), 'PT' (Portugal).
  country     text,
  -- Aktiv = kann für neue Produktionsbestellungen gewählt werden.
  active      boolean not null default true,
  -- Priorität für die spätere Priorisierungslogik (kleiner = höher).
  -- Nullable, wird in diesem Schritt noch nicht genutzt.
  priority    integer,
  created_at  timestamptz default now()
);

create index if not exists idx_producers_org on producers(org_id);

alter table producers enable row level security;

create policy "producers_select" on producers for select using (org_id = auth_org_id());
create policy "producers_insert" on producers for insert with check (org_id = auth_org_id());
create policy "producers_update" on producers for update using (org_id = auth_org_id());
create policy "producers_delete" on producers for delete using (org_id = auth_org_id());

-- ─── Produktionsbestellung ↔ Produzent ──────────────────────────────────────
-- Nullable FK: bestehende Zeilen behalten NULL (bisher implizit Nepal), die
-- Zuordnung erfolgt in einem späteren Schritt.
alter table production_orders
  add column if not exists producer_id uuid references producers(id);

create index if not exists idx_po_producer on production_orders(producer_id);
