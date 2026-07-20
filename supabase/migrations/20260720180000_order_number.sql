-- ============================================================================
-- AUFTRAGSNUMMER für Kundenorders (Thema 2): fortlaufend, eindeutig, lückenlos
-- Jede Order bekommt beim Übergang auf Status 'confirmed' (= Fertigstellung /
-- Auftragsbestätigung) eine Nummer im Format AB-YYYY-NNNN — bewusst mit Präfix
-- „AB-", damit sie NICHT mit der Rechnungsnummer (YYYY-NNNN) verwechselbar ist.
-- Muster analog next_invoice_number (max+1 je Org/Jahr, security definer).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. Additiv & idempotent:
-- ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS / CREATE OR
-- REPLACE FUNCTION / guarded UPDATE (nur order_number IS NULL). Kein DROP, kein
-- RENAME, kein Typwechsel an bestehenden Spalten, keine RLS-Änderung.
--
-- Voraussetzung: Tabelle orders besteht.
-- ============================================================================


-- ─── 1) Spalte (nullable — Entwürfe und Bestandsorders starten NULL) ────────
alter table orders
  add column if not exists order_number text;

-- Eindeutig je Org. Nullable → mehrere NULLs erlaubt (Entwürfe ohne Nummer).
create unique index if not exists orders_org_number_uniq
  on orders(org_id, order_number);


-- ─── 2) Fortlaufende Auftragsnummer ohne Lücken (Format AB-YYYY-0001) ───────
-- Zähler = letztes '-'-Segment (bei AB-2026-0001 also Teil 3).
create or replace function next_order_number(p_org_id uuid)
returns text as $$
declare
  last_num integer;
  year_prefix text;
begin
  year_prefix := to_char(current_date, 'YYYY');
  select coalesce(max(
    cast(split_part(order_number, '-', 3) as integer)
  ), 0) into last_num
  from orders
  where org_id = p_org_id
    and order_number like 'AB-' || year_prefix || '-%';
  return 'AB-' || year_prefix || '-' || lpad((last_num + 1)::text, 4, '0');
end;
$$ language plpgsql security definer;


-- ─── 3) Backfill: bestehende BESTÄTIGTE Orders lückenlos nachnummerieren ────
-- Bestandsorders, die bereits 'confirmed' sind, würden den confirmed-Übergang
-- nie erneut durchlaufen und blieben sonst ohne Nummer. Wir vergeben sie EINMALIG
-- je (Org, Erstellungsjahr) in created_at-Reihenfolge — so ist die Historie
-- vollständig und lückenlos. Guarded auf order_number IS NULL → idempotent
-- (erneuter Lauf ändert nichts). Nicht-bestätigte (Entwürfe) bleiben bewusst NULL.
with numbered as (
  select
    id,
    'AB-' || to_char(created_at, 'YYYY') || '-' ||
    lpad(
      row_number() over (
        partition by org_id, to_char(created_at, 'YYYY')
        order by created_at, id
      )::text,
      4, '0'
    ) as num
  from orders
  where status = 'confirmed'
    and order_number is null
)
update orders o
  set order_number = n.num
  from numbered n
  where o.id = n.id;
