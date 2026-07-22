-- S2 Lieferschein als echtes Dokument — eigene, eingefrorene Positionen
--
-- Bisher war der Lieferschein ein reiner Kopf-Datensatz; die Positionen wurden
-- zur PDF-Zeit LIVE aus delivery_items gelesen. Damit war der Beleg weder
-- unabhängig einfrierbar noch im Entwurf bereinigbar. Diese Tabelle friert die
-- Positionen beim Erzeugen ein (Snapshot, wie invoice_items) — Grundlage für
-- Entwurf-Bereinigung, Kommissionsware-Retour (LS reduzieren) und den freien
-- Lieferschein ohne Order (FALL B).
--
-- Aufbau analog invoice_items (Kind der Beleg-Tabelle, KEIN eigenes org_id —
-- RLS läuft über die Eltern-Tabelle delivery_notes). Zusätzlich UPDATE/DELETE-
-- Policies, weil Positionen im Entwurf bereinigt werden dürfen. Rein additiv &
-- idempotent.

create table if not exists delivery_note_items (
  id                uuid primary key default uuid_generate_v4(),
  delivery_note_id  uuid not null references delivery_notes(id) on delete cascade,
  -- Snapshot-Felder (überleben Quelländerung, wie invoice_items):
  product_id        uuid references products(id),
  description       text not null,
  color             text,
  size              text,
  quantity          integer not null,
  created_at        timestamptz default now()
);

create index if not exists idx_delivery_note_items_note
  on delivery_note_items(delivery_note_id);

alter table delivery_note_items enable row level security;

-- Idempotent: bei erneutem Einspielen erst weg, dann neu.
drop policy if exists "dni_select" on delivery_note_items;
drop policy if exists "dni_insert" on delivery_note_items;
drop policy if exists "dni_update" on delivery_note_items;
drop policy if exists "dni_delete" on delivery_note_items;

create policy "dni_select" on delivery_note_items for select using (
  exists (select 1 from delivery_notes dn
          where dn.id = delivery_note_id and dn.org_id = auth_org_id())
);
create policy "dni_insert" on delivery_note_items for insert with check (
  exists (select 1 from delivery_notes dn
          where dn.id = delivery_note_id and dn.org_id = auth_org_id())
);
create policy "dni_update" on delivery_note_items for update using (
  exists (select 1 from delivery_notes dn
          where dn.id = delivery_note_id and dn.org_id = auth_org_id())
);
create policy "dni_delete" on delivery_note_items for delete using (
  exists (select 1 from delivery_notes dn
          where dn.id = delivery_note_id and dn.org_id = auth_org_id())
);

-- ─── Backfill: bestehende Lieferscheine zahlengleich halten ──────────────────
-- Für jeden vorhandenen Lieferschein die Positionen aus den delivery_items der
-- zugehörigen Lieferung als Snapshot nachziehen (Bezeichnung = Produktname).
-- Idempotent über NOT EXISTS — ein zweiter Lauf fügt nichts doppelt ein. So
-- liefert eine spätere PDF-Neuerzeugung exakt dieselben Positionen wie bisher.
insert into delivery_note_items (delivery_note_id, product_id, description, color, size, quantity)
select dn.id, di.product_id, coalesce(p.name, 'Artikel'), di.color, di.size, di.quantity
from delivery_notes dn
join delivery_items di on di.delivery_id = dn.delivery_id
left join products p on p.id = di.product_id
where not exists (
  select 1 from delivery_note_items x where x.delivery_note_id = dn.id
);
