-- ============================================================================
-- ORDER→LIEFERUNG-LINK — Session 1: expliziter order_id an deliveries
-- Kundenentscheidung (Weg A): Lieferungen entstehen künftig JE ORDER (nicht je
-- Händler). Damit ist die Ursprungs-Order an jeder neuen Lieferung eindeutig
-- gesetzt; Rechnung und Lieferschein lesen die Konditionen später (Session 2/3)
-- ohne Raten. Ein Händler mit mehreren Orders (agent + internal) bekommt mehrere
-- Lieferungen — bewusst so (saubere Provisionstrennung).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / guarded UPDATE. Kein
-- DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung.
--
-- Alt-Daten (Wächter): order_id ist NULLABLE. Bestehende Lieferungen behalten
-- ihr heutiges Verhalten; ein nachträglich gesetztes order_id ändert KEINEN
-- bereits erzeugten Beleg (Rechnungen/Lieferscheine sind mit eingefrorenen
-- Werten erstellt). Der Backfill setzt order_id NUR dort, wo es EINDEUTIG ist
-- (Händler+Saison hat genau eine bestätigte Order); mehrdeutige bleiben NULL und
-- fallen weiter auf das heutige Verhalten zurück.
--
-- Voraussetzung: Tabellen deliveries, orders, production_orders.
-- ============================================================================


-- ─── 1) Spalte + Index ──────────────────────────────────────────────────────
alter table deliveries
  add column if not exists order_id uuid references orders(id);

create index if not exists idx_deliveries_order on deliveries(order_id);


-- ─── 2) Backfill NUR für eindeutige Fälle ───────────────────────────────────
-- Je Alt-Lieferung: gibt es in der Saison der Produktionsbestellung GENAU EINE
-- bestätigte Order dieses Händlers, wird sie verlinkt (cnt = 1). Mehrere Orders
-- (agent + internal) → mehrdeutig → order_id bleibt NULL. Guarded auf
-- order_id IS NULL → idempotent (erneuter Lauf ändert nichts).
update deliveries d
set order_id = sub.oid
from (
  select
    d2.id             as delivery_id,
    (array_agg(o.id))[1] as oid,
    count(*)          as cnt
  from deliveries d2
  join production_orders po on po.id = d2.production_order_id
  join orders o
    on o.dealer_id = d2.dealer_id
   and o.season_id = po.season_id
   and o.status = 'confirmed'
  where d2.order_id is null
  group by d2.id
) sub
where d.id = sub.delivery_id
  and sub.cnt = 1;
