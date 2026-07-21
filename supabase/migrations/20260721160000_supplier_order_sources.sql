-- ============================================================================
-- LIEFERANTEN-ORDER NEPAL — Modul A: Quell-Verknüpfung „offene AB"
-- Merkt sich, welche Kunden-Auftragspositionen (order_items) in welche
-- Sammelbestellung (production_orders) geflossen sind. „Offen" = bestätigte
-- order_items, die in KEINER Sammelbestellung stecken. So werden Doppel-
-- bestellungen vermieden und später bestätigte AB als Nachbestellung erfasst.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- CREATE TABLE/INDEX/POLICY IF NOT EXISTS. Kein DROP, kein RENAME, kein
-- Typwechsel. Multi-Tenant: org_id + dieselben RLS-Policies wie der Rest.
--
-- unique(order_item_id): eine Auftragsposition kann nur in EINER Sammelbestellung
-- verbraucht werden (harter Backstop gegen Doppelzählung). ON DELETE CASCADE:
-- wird die Sammelbestellung oder die Auftragsposition gelöscht, wird die Position
-- wieder „offen" (Quell-Link verschwindet mit).
--
-- Voraussetzung: organizations, production_orders, order_items, auth_org_id().
-- ============================================================================

create table if not exists supplier_order_sources (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references organizations(id),
  production_order_id uuid not null references production_orders(id) on delete cascade,
  order_item_id       uuid not null references order_items(id) on delete cascade,
  created_at          timestamptz default now(),
  unique (order_item_id)
);

create index if not exists idx_sos_org on supplier_order_sources(org_id);
create index if not exists idx_sos_po on supplier_order_sources(production_order_id);

alter table supplier_order_sources enable row level security;

create policy "sos_select" on supplier_order_sources for select using (org_id = auth_org_id());
create policy "sos_insert" on supplier_order_sources for insert with check (org_id = auth_org_id());
create policy "sos_update" on supplier_order_sources for update using (org_id = auth_org_id());
create policy "sos_delete" on supplier_order_sources for delete using (org_id = auth_org_id());
