-- ============================================================================
-- MODUL A3 — Ordererfassung (orders + order_items)
-- Diese Migration MUSS ausgeführt werden — die Tabellen existieren noch nicht.
-- Ausführen im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg) oder via
-- Management API. Voraussetzungen: organizations, dealers, seasons, products,
-- profiles sowie die Funktionen auth_org_id() und update_updated_at() bestehen.
-- ============================================================================

create table orders (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  dealer_id     uuid not null references dealers(id),
  season_id     uuid not null references seasons(id),
  status        text not null default 'draft'
                check (status in ('draft', 'submitted', 'confirmed')),
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table order_items (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid not null references products(id),
  color         text,
  size          text,
  quantity      integer not null default 0,
  unit_price    numeric(10,2),
  created_at    timestamptz default now()
);

create index idx_orders_org on orders(org_id);
create index idx_orders_dealer on orders(dealer_id);
create index idx_orders_season on orders(season_id);
create index idx_order_items_order on order_items(order_id);

alter table orders enable row level security;
alter table order_items enable row level security;

create policy "orders_select" on orders for select using (org_id = auth_org_id());
create policy "orders_insert" on orders for insert with check (org_id = auth_org_id());
create policy "orders_update" on orders for update using (org_id = auth_org_id());
create policy "orders_delete" on orders for delete using (org_id = auth_org_id());

create policy "oi_select" on order_items for select using (
  exists (select 1 from orders where orders.id = order_id and orders.org_id = auth_org_id())
);
create policy "oi_insert" on order_items for insert with check (
  exists (select 1 from orders where orders.id = order_id and orders.org_id = auth_org_id())
);
create policy "oi_update" on order_items for update using (
  exists (select 1 from orders where orders.id = order_id and orders.org_id = auth_org_id())
);
create policy "oi_delete" on order_items for delete using (
  exists (select 1 from orders where orders.id = order_id and orders.org_id = auth_org_id())
);

create trigger trg_orders_updated before update on orders
  for each row execute function update_updated_at();
