-- ============================================================================
-- LIEFERANTEN-ORDER NEPAL — Modul D: Prioritäts-Aufteilung beim Bestellen
-- Die Mitarbeiterin trägt je Position eine Bestellmenge ein (Default = Bedarf).
-- Ist sie kleiner als der Bedarf, verteilt der Rechenkern nach Priorität
-- (Häkchen → dealer_season_priority → geseedter Zufall). Damit Vorschau und
-- eingefrorene Aufteilung identisch sind, wird der Seed je Sammelbestellung
-- eingefroren; ab „gesendet" wird die Aufteilung als Snapshot festgeschrieben
-- (Grundlage der späteren Verteilung an die Kunden, Modul E).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ADD COLUMN IF NOT EXISTS / CREATE TABLE/INDEX/POLICY IF NOT EXISTS. Kein DROP,
-- kein RENAME, kein Typwechsel, keine RLS-Änderung. Multi-Tenant: org_id + RLS.
--
-- Voraussetzung: production_orders, production_order_items, orders, products,
-- organizations, auth_org_id().
-- ============================================================================


-- ─── 1) Bestellmenge je Position (nullable; NULL → es gilt der Bedarf) ───────
alter table production_order_items
  add column if not exists order_quantity integer;


-- ─── 2) Eingefrorener Seed je Sammelbestellung (Tie-Break reproduzierbar) ───
alter table production_orders
  add column if not exists priority_seed integer;


-- ─── 3) Eingefrorene Aufteilung je (Bestellung, Kunde, Position) ────────────
-- Snapshot ab „gesendet": welcher Kunden-Auftrag bekommt wie viel Stück einer
-- Position. Spätere Änderungen an den Orders wirken NICHT zurück (Snapshot).
create table if not exists supplier_order_allocations (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organizations(id),
  production_order_id uuid not null references production_orders(id) on delete cascade,
  order_id            uuid not null references orders(id) on delete cascade,
  product_id          uuid references products(id),
  color               text,
  size                text,
  allocated_quantity  integer not null default 0,
  created_at          timestamptz default now()
);

create index if not exists idx_soa_org on supplier_order_allocations(org_id);
create index if not exists idx_soa_po on supplier_order_allocations(production_order_id);
create index if not exists idx_soa_order on supplier_order_allocations(order_id);

alter table supplier_order_allocations enable row level security;

create policy "soa_select" on supplier_order_allocations for select using (org_id = auth_org_id());
create policy "soa_insert" on supplier_order_allocations for insert with check (org_id = auth_org_id());
create policy "soa_update" on supplier_order_allocations for update using (org_id = auth_org_id());
create policy "soa_delete" on supplier_order_allocations for delete using (org_id = auth_org_id());
