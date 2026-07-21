-- ============================================================================
-- LIEFERANTEN-ORDER NEPAL — Modul B: Nummer + Snapshot
-- Jede Sammelbestellung bekommt beim Übergang auf Status 'sent' eine
-- fortlaufende, lückenlose Nummer im Format LB-YYYY-NNNN (LB = Lieferanten-
-- Bestellung) — bewusst mit eigenem Präfix, NICHT verwechselbar mit AB-YYYY-NNNN
-- (Kundenauftrag) oder YYYY-NNNN (Rechnung). Muster analog next_order_number /
-- next_invoice_number (max+1 je Org/Jahr, security definer).
--
-- Snapshot: ab 'sent' gilt die Bestellung als eingefroren (Mengen/Positionen) —
-- die Sperre wird app-seitig erzwungen (isSupplierOrderLocked), hier nur die
-- Nummer + der Backstop-Unique-Index.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. Additiv & idempotent:
-- ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS / CREATE OR
-- REPLACE FUNCTION / guarded UPDATE (nur supplier_order_number IS NULL). Kein
-- DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung.
--
-- Voraussetzung: Tabelle production_orders besteht.
-- ============================================================================


-- ─── 1) Spalte (nullable — Entwürfe starten ohne Nummer) ────────────────────
alter table production_orders
  add column if not exists supplier_order_number text;

-- Eindeutig je Org. Nullable → mehrere NULLs (Entwürfe) erlaubt.
create unique index if not exists production_orders_org_supplier_number_uniq
  on production_orders(org_id, supplier_order_number);


-- ─── 2) Fortlaufende Nummer ohne Lücken (Format LB-YYYY-0001) ───────────────
-- Zähler = letztes '-'-Segment (bei LB-2026-0001 also Teil 3).
create or replace function next_supplier_order_number(p_org_id uuid)
returns text as $$
declare
  last_num integer;
  year_prefix text;
begin
  year_prefix := to_char(current_date, 'YYYY');
  select coalesce(max(
    cast(split_part(supplier_order_number, '-', 3) as integer)
  ), 0) into last_num
  from production_orders
  where org_id = p_org_id
    and supplier_order_number like 'LB-' || year_prefix || '-%';
  return 'LB-' || year_prefix || '-' || lpad((last_num + 1)::text, 4, '0');
end;
$$ language plpgsql security definer;


-- ─── 3) Backfill: bereits gesendete (oder weiter) Bestellungen ──────────────
-- Bestellungen, die den 'sent'-Übergang schon hinter sich haben, aber vor der
-- Nummerierung entstanden, würden sonst ohne Nummer bleiben. Einmalig je
-- (Org, Erstellungsjahr) in created_at-Reihenfolge nachnummerieren. Guarded auf
-- supplier_order_number IS NULL → idempotent. Entwürfe (status='draft') bleiben
-- bewusst ohne Nummer.
with numbered as (
  select
    id,
    'LB-' || to_char(created_at, 'YYYY') || '-' ||
    lpad(
      row_number() over (
        partition by org_id, to_char(created_at, 'YYYY')
        order by created_at, id
      )::text,
      4, '0'
    ) as num
  from production_orders
  where status <> 'draft'
    and supplier_order_number is null
)
update production_orders p
  set supplier_order_number = n.num
  from numbered n
  where p.id = n.id;
