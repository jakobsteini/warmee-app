-- ============================================================================
-- MODUL A5 — Wareneingang & Verteilung (deliveries + delivery_items)
-- Diese Migration MUSS ausgeführt werden — die Tabellen existieren noch nicht.
-- Ausführen im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg) oder via
-- Management API. Voraussetzungen: organizations, production_orders, dealers,
-- products sowie die Funktionen auth_org_id() und update_updated_at() bestehen.
-- Wenn eine Nepal-Bestellung (production_orders) den Status „received" erreicht,
-- wird die Ware anhand der bestätigten Händlerorders derselben Saison auf die
-- einzelnen Händler verteilt: je Händler eine Delivery mit seinen Positionen.
-- ============================================================================

create table deliveries (
  id                    uuid primary key default uuid_generate_v4(),
  org_id                uuid not null references organizations(id),
  production_order_id   uuid not null references production_orders(id),
  dealer_id             uuid not null references dealers(id),
  status                text not null default 'pending'
                        check (status in ('pending', 'packed', 'shipped', 'delivered')),
  notes                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create table delivery_items (
  id            uuid primary key default uuid_generate_v4(),
  delivery_id   uuid not null references deliveries(id) on delete cascade,
  product_id    uuid not null references products(id),
  color         text,
  size          text,
  quantity      integer not null default 0,
  created_at    timestamptz default now()
);

create index idx_deliveries_org on deliveries(org_id);
create index idx_deliveries_po on deliveries(production_order_id);
create index idx_deliveries_dealer on deliveries(dealer_id);
create index idx_delivery_items_del on delivery_items(delivery_id);

alter table deliveries enable row level security;
alter table delivery_items enable row level security;

create policy "del_select" on deliveries for select using (org_id = auth_org_id());
create policy "del_insert" on deliveries for insert with check (org_id = auth_org_id());
create policy "del_update" on deliveries for update using (org_id = auth_org_id());
create policy "del_delete" on deliveries for delete using (org_id = auth_org_id());

create policy "di_select" on delivery_items for select using (
  exists (select 1 from deliveries where deliveries.id = delivery_id and deliveries.org_id = auth_org_id())
);
create policy "di_insert" on delivery_items for insert with check (
  exists (select 1 from deliveries where deliveries.id = delivery_id and deliveries.org_id = auth_org_id())
);
-- Ergänzung gegenüber dem ursprünglichen Entwurf: ohne UPDATE-Policy blockiert
-- RLS das Editieren der Liefermengen (Teillieferung). Analog zu oi_update.
create policy "di_update" on delivery_items for update using (
  exists (select 1 from deliveries where deliveries.id = delivery_id and deliveries.org_id = auth_org_id())
);
create policy "di_delete" on delivery_items for delete using (
  exists (select 1 from deliveries where deliveries.id = delivery_id and deliveries.org_id = auth_org_id())
);

create trigger trg_deliveries_updated before update on deliveries
  for each row execute function update_updated_at();
