-- ============================================================================
-- MODUL A4 — Nepal-Bestellung (production_orders + production_order_items)
-- Diese Migration MUSS ausgeführt werden — die Tabellen existieren noch nicht.
-- Ausführen im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg) oder via
-- Management API. Voraussetzungen: organizations, seasons, products, profiles
-- sowie die Funktion auth_org_id() bestehen. Nach Orderschluss werden alle
-- bestätigten Händlerorders einer Saison zu einer Produktionsbestellung
-- aggregiert (nach Produkt + Farbe + Größe, Stückzahlen summiert).
-- ============================================================================

create table production_orders (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  season_id     uuid not null references seasons(id),
  status        text not null default 'draft'
                check (status in ('draft', 'sent', 'in_production', 'shipped', 'received')),
  generated_at  timestamptz default now(),
  sent_at       timestamptz,
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
);

create table production_order_items (
  id                    uuid primary key default uuid_generate_v4(),
  production_order_id   uuid not null references production_orders(id) on delete cascade,
  product_id            uuid not null references products(id),
  color                 text,
  size                  text,
  total_quantity        integer not null default 0,
  created_at            timestamptz default now()
);

create index idx_po_org on production_orders(org_id);
create index idx_po_season on production_orders(season_id);
create index idx_poi_po on production_order_items(production_order_id);

alter table production_orders enable row level security;
alter table production_order_items enable row level security;

create policy "po_select" on production_orders for select using (org_id = auth_org_id());
create policy "po_insert" on production_orders for insert with check (org_id = auth_org_id());
create policy "po_update" on production_orders for update using (org_id = auth_org_id());
create policy "po_delete" on production_orders for delete using (org_id = auth_org_id());

create policy "poi_select" on production_order_items for select using (
  exists (select 1 from production_orders where production_orders.id = production_order_id and production_orders.org_id = auth_org_id())
);
create policy "poi_insert" on production_order_items for insert with check (
  exists (select 1 from production_orders where production_orders.id = production_order_id and production_orders.org_id = auth_org_id())
);
create policy "poi_delete" on production_order_items for delete using (
  exists (select 1 from production_orders where production_orders.id = production_order_id and production_orders.org_id = auth_org_id())
);
