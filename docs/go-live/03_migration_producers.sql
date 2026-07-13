-- ============================================================================
-- 03 · MIGRATION producers (Produzenten-Tabelle + producer_id auf production_orders)
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent.
-- Legt die producers-Tabelle (org-scoped + RLS) an und ergänzt production_orders
-- um producer_id. Erwartet: keine Fehler.
-- ============================================================================

create table if not exists producers (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  name        text not null,
  country     text,
  active      boolean not null default true,
  priority    integer,
  created_at  timestamptz default now()
);

create index if not exists idx_producers_org on producers(org_id);

alter table producers enable row level security;

-- Policies idempotent anlegen (drop-if-exists, damit erneutes Ausführen nicht bricht).
drop policy if exists "producers_select" on producers;
create policy "producers_select" on producers for select using (org_id = auth_org_id());
drop policy if exists "producers_insert" on producers;
create policy "producers_insert" on producers for insert with check (org_id = auth_org_id());
drop policy if exists "producers_update" on producers;
create policy "producers_update" on producers for update using (org_id = auth_org_id());
drop policy if exists "producers_delete" on producers;
create policy "producers_delete" on producers for delete using (org_id = auth_org_id());

-- Nullable FK auf producers.
alter table production_orders
  add column if not exists producer_id uuid references producers(id);

create index if not exists idx_po_producer on production_orders(producer_id);
