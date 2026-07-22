-- S6b Kommissions-Retoure Variante 2 — Retoure am LIEFERSCHEIN verankern
--
-- Bisher hängt eine Retoure zwingend an einer Rechnung (invoice_id NOT NULL).
-- Kommissionsware ist aber (noch) nie fakturiert — die Rücksendung wird deshalb
-- am LIEFERSCHEIN verankert. Eine Retoure ist damit ENTWEDER rechnungs- ODER
-- lieferschein-verankert (XOR). LS-verankerte Retouren sind reine MENGEN-
-- Dokumentation (kein Geld-Kredit): Beträge bleiben 0, sie tauchen in keiner
-- Geld-Auswertung (offene Posten, Provision) auf.
--
-- Rein additiv & idempotent: ADD COLUMN IF NOT EXISTS, ALTER COLUMN DROP NOT NULL
-- (no-op bei erneutem Lauf), CHECK per pg_constraint-Guard. Bestehende Retouren
-- haben invoice_id gesetzt / delivery_note_id NULL → erfüllen den XOR-Check und
-- bleiben unberührt.

alter table returns
  add column if not exists delivery_note_id uuid references delivery_notes(id) on delete cascade;
alter table returns alter column invoice_id drop not null;

alter table return_items
  add column if not exists delivery_note_item_id uuid references delivery_note_items(id) on delete cascade;
alter table return_items alter column invoice_item_id drop not null;

-- Genau EINE Verankerung je Retoure (Rechnung XOR Lieferschein).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'returns_anchor_xor') then
    alter table returns add constraint returns_anchor_xor
      check ((invoice_id is not null) <> (delivery_note_id is not null));
  end if;
end $$;

create index if not exists idx_returns_delivery_note on returns(delivery_note_id);
create index if not exists idx_return_items_dni on return_items(delivery_note_item_id);
