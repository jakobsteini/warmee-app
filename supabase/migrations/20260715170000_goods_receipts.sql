-- ============================================================================
-- WARENEINGANG — reale Eingangsmengen je Produktionsbestellung
-- Quelle: Systemanforderungen WARM ME, Abschnitt 4 (Wareneingang &
-- Warenverteilung).
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, production_orders,
-- production_order_items, profiles sowie auth_org_id() und update_updated_at()
-- bestehen bereits.
--
-- REIN ADDITIV & idempotent: nur CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS / CREATE POLICY / CREATE TRIGGER auf NEUEN Tabellen. Kein DROP,
-- kein RENAME, kein Typwechsel, keine bestehende Tabelle verändert. Die
-- Echtdaten bleiben unberührt — hier entstehen ausschließlich zwei leere Tabellen.
--
-- Fachlich zentral:
--   * Bisher war der Wareneingang nur ein Flag (production_orders.status =
--     'received'). Ab jetzt werden die TATSÄCHLICH aus Nepal eingegangenen
--     Mengen je Position erfasst. Das Flag bleibt bestehen (Workflow-Tor der
--     Verteilung); die App hebt es beim ERSTEN Wareneingang automatisch auf
--     'received'.
--   * Teillieferungen: es kann MEHRERE Wareneingänge (goods_receipts) je
--     Produktionsbestellung geben. „Eingegangen gesamt" = Summe über alle.
--   * Anker der Positionsmenge ist production_order_item_id (die konkrete
--     Nepal-Position, Soll-Seite). product_id/color/size werden per Join von
--     der Position geerbt — trägt das nullable product_id sauber mit.
--   * Mengenkontrolle (Verteilung ≤ Eingang) und der Abgleich Eingang↔Verteilung
--     laufen app-seitig gegen diese Mengen; hier nur die Datenhaltung.
--
-- Multi-Tenant: goods_receipts trägt org_id + die üblichen vier RLS-Policies
-- (org_id = auth_org_id()). goods_receipt_items trägt — wie ALLE bestehenden
-- Positions-Tabellen (delivery_items, invoice_items, production_order_items) —
-- KEIN org_id, sondern scopet über den Kopf per EXISTS. org_id wird app-seitig
-- beim Insert des Kopfes gesetzt.
-- ============================================================================


-- ─── (a) Wareneingang-Kopf (mehrere je Produktionsbestellung) ───────────────
create table if not exists goods_receipts (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null references organizations(id),
  production_order_id  uuid not null references production_orders(id),
  received_date        date not null default current_date,
  notes                text,
  created_by           uuid references profiles(id),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists idx_goods_receipts_org on goods_receipts(org_id);
create index if not exists idx_goods_receipts_po  on goods_receipts(production_order_id);

alter table goods_receipts enable row level security;

create policy "goods_receipts_select" on goods_receipts for select using (org_id = auth_org_id());
create policy "goods_receipts_insert" on goods_receipts for insert with check (org_id = auth_org_id());
create policy "goods_receipts_update" on goods_receipts for update using (org_id = auth_org_id());
create policy "goods_receipts_delete" on goods_receipts for delete using (org_id = auth_org_id());

create trigger trg_goods_receipts_updated before update on goods_receipts
  for each row execute function update_updated_at();


-- ─── (b) Erfasste Eingangsmengen je Nepal-Position ──────────────────────────
-- quantity = in DIESEM Wareneingang eingegangene Stückzahl der Position (>= 0).
-- Eine Zeile je (Wareneingang, Position): dieselbe Position wird innerhalb eines
-- Wareneingangs nicht doppelt geführt. Mehrere Teillieferungen ergeben mehrere
-- goods_receipts, nicht mehrere Zeilen desselben Wareneingangs.
create table if not exists goods_receipt_items (
  id                        uuid primary key default uuid_generate_v4(),
  goods_receipt_id          uuid not null references goods_receipts(id) on delete cascade,
  production_order_item_id  uuid not null references production_order_items(id),
  quantity                  integer not null default 0 check (quantity >= 0),
  created_at                timestamptz default now(),
  unique (goods_receipt_id, production_order_item_id)
);

create index if not exists idx_gri_receipt on goods_receipt_items(goods_receipt_id);
create index if not exists idx_gri_poi     on goods_receipt_items(production_order_item_id);

alter table goods_receipt_items enable row level security;

-- Scope über den Kopf (goods_receipts.org_id) — analog delivery_items/invoice_items.
create policy "gri_select" on goods_receipt_items for select using (
  exists (select 1 from goods_receipts where goods_receipts.id = goods_receipt_id and goods_receipts.org_id = auth_org_id())
);
create policy "gri_insert" on goods_receipt_items for insert with check (
  exists (select 1 from goods_receipts where goods_receipts.id = goods_receipt_id and goods_receipts.org_id = auth_org_id())
);
create policy "gri_update" on goods_receipt_items for update using (
  exists (select 1 from goods_receipts where goods_receipts.id = goods_receipt_id and goods_receipts.org_id = auth_org_id())
);
create policy "gri_delete" on goods_receipt_items for delete using (
  exists (select 1 from goods_receipts where goods_receipts.id = goods_receipt_id and goods_receipts.org_id = auth_org_id())
);
