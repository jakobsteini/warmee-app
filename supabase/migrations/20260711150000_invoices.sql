-- ============================================================================
-- MODUL A6 — Lieferschein & Rechnung (invoices, invoice_items, delivery_notes)
-- Diese Migration MUSS ausgeführt werden — die Tabellen existieren noch nicht.
-- Ausführen im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg) oder via
-- Management API. Voraussetzungen: organizations, deliveries, delivery_items,
-- dealers, products, profiles sowie die Funktionen auth_org_id() und
-- update_updated_at() bestehen.
--
-- Aus jeder Delivery (A5) entstehen ein Lieferschein (LS-YYYY-0001) und eine
-- Rechnung (YYYY-0001). Rechnungen sind steuerrelevante Dokumente mit
-- fortlaufender Nummer OHNE Lücken — die Nummer wird bei Anlage vergeben und
-- der Datensatz sofort committet, auch wenn die PDF-Erzeugung später erfolgt.
-- WARM ME ist Kleinunternehmer: keine USt (§ 6 Abs. 1 Z 27 UStG).
-- ============================================================================

-- ─── Rechnungen ────────────────────────────────────────────────────────────
create table invoices (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id),
  delivery_id     uuid not null references deliveries(id),
  dealer_id       uuid not null references dealers(id),
  invoice_number  text not null,
  invoice_date    date not null default current_date,
  due_date        date,
  subtotal        numeric(10,2) not null default 0,
  tax_rate        numeric(5,2) not null default 0,
  tax_amount      numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  status          text not null default 'draft'
                  check (status in ('draft', 'sent', 'paid', 'cancelled')),
  cancelled_by    uuid references invoices(id),
  notes           text,
  pdf_path        text,
  created_by      uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(org_id, invoice_number)
);

create table invoice_items (
  id              uuid primary key default uuid_generate_v4(),
  invoice_id      uuid not null references invoices(id) on delete cascade,
  product_id      uuid references products(id),
  description     text not null,
  color           text,
  size            text,
  quantity        integer not null,
  unit_price      numeric(10,2) not null,
  line_total      numeric(10,2) not null,
  created_at      timestamptz default now()
);

create index idx_invoices_org on invoices(org_id);
create index idx_invoices_dealer on invoices(dealer_id);
create index idx_invoices_delivery on invoices(delivery_id);
create index idx_invoice_items_inv on invoice_items(invoice_id);

alter table invoices enable row level security;
alter table invoice_items enable row level security;

create policy "inv_select" on invoices for select using (org_id = auth_org_id());
create policy "inv_insert" on invoices for insert with check (org_id = auth_org_id());
create policy "inv_update" on invoices for update using (org_id = auth_org_id());

create policy "ii_select" on invoice_items for select using (
  exists (select 1 from invoices where invoices.id = invoice_id and invoices.org_id = auth_org_id())
);
create policy "ii_insert" on invoice_items for insert with check (
  exists (select 1 from invoices where invoices.id = invoice_id and invoices.org_id = auth_org_id())
);

create trigger trg_invoices_updated before update on invoices
  for each row execute function update_updated_at();

-- Fortlaufende Rechnungsnummer ohne Lücken (Format YYYY-0001).
create or replace function next_invoice_number(p_org_id uuid)
returns text as $$
declare
  last_num integer;
  year_prefix text;
begin
  year_prefix := to_char(current_date, 'YYYY');
  select coalesce(max(
    cast(split_part(invoice_number, '-', 2) as integer)
  ), 0) into last_num
  from invoices
  where org_id = p_org_id
  and invoice_number like year_prefix || '-%';
  return year_prefix || '-' || lpad((last_num + 1)::text, 4, '0');
end;
$$ language plpgsql security definer;

-- ─── Lieferscheine ─────────────────────────────────────────────────────────
-- Gleicher Aufbau wie die Rechnung, aber ohne Preise und mit eigener
-- Nummerierung (LS-YYYY-0001). Da der Lieferschein keine Beträge zeigt, genügt
-- ein Kopf-Datensatz — die Positionen werden zum Zeitpunkt der PDF-Erzeugung
-- aus den delivery_items gelesen.
create table delivery_notes (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id),
  delivery_id     uuid not null references deliveries(id),
  dealer_id       uuid not null references dealers(id),
  note_number     text not null,
  note_date       date not null default current_date,
  notes           text,
  pdf_path        text,
  created_by      uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(org_id, note_number)
);

create index idx_delivery_notes_org on delivery_notes(org_id);
create index idx_delivery_notes_delivery on delivery_notes(delivery_id);

alter table delivery_notes enable row level security;

create policy "dn_select" on delivery_notes for select using (org_id = auth_org_id());
create policy "dn_insert" on delivery_notes for insert with check (org_id = auth_org_id());
create policy "dn_update" on delivery_notes for update using (org_id = auth_org_id());

create trigger trg_delivery_notes_updated before update on delivery_notes
  for each row execute function update_updated_at();

-- Fortlaufende Lieferscheinnummer (Format LS-YYYY-0001).
create or replace function next_delivery_note_number(p_org_id uuid)
returns text as $$
declare
  last_num integer;
  year_prefix text;
begin
  year_prefix := to_char(current_date, 'YYYY');
  select coalesce(max(
    cast(split_part(note_number, '-', 3) as integer)
  ), 0) into last_num
  from delivery_notes
  where org_id = p_org_id
  and note_number like 'LS-' || year_prefix || '-%';
  return 'LS-' || year_prefix || '-' || lpad((last_num + 1)::text, 4, '0');
end;
$$ language plpgsql security definer;

-- ─── Storage-Bucket "invoices" (privat) ────────────────────────────────────
-- Lieferschein- und Rechnungs-PDFs werden unter <org_id>/<datei>.pdf abgelegt.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoices_obj_select" on storage.objects for select
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth_org_id()::text);
create policy "invoices_obj_insert" on storage.objects for insert
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth_org_id()::text);
create policy "invoices_obj_update" on storage.objects for update
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth_org_id()::text);
