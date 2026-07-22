-- ============================================================================
-- S4 BELEG-ARCHIV — unveränderbare PDF-Ablage (BAO §132, ≥ 7 Jahre)
-- Aus dem freigegebenen Beleg-Prozess-Plan. Vorlage: dealer_documents.
--
-- Beim Übergang eines Belegs auf „Versendet" wird automatisch eine finale PDF
-- (aus den EINGEFRORENEN Snapshots gebaut) hier abgelegt und darf danach nicht
-- mehr geändert oder gelöscht werden — auch nicht nach einer Stornierung. Die
-- Unveränderbarkeit wird per POLICY erzwungen (Entscheidung: Policy-Immutabilität
-- statt hardware-WORM):
--   * Metadaten-Tabelle belege_archiv: NUR select + insert — KEINE update-,
--     KEINE delete-Policy. Damit kann kein Org-Nutzer eine Archivzeile ändern
--     oder entfernen.
--   * Storage-Bucket belege-archiv (PRIVAT): NUR select + insert — kein update
--     (kein Überschreiben/upsert) und kein delete. Write-once.
--
-- REIN ADDITIV & idempotent: CREATE TABLE/INDEX IF NOT EXISTS, (drop policy if
-- exists +) CREATE POLICY, bucket-INSERT ON CONFLICT DO NOTHING. Kein DROP/
-- RENAME/Typwechsel, keine bestehende Tabelle verändert.
--
-- BEWUSSTE ENTSCHEIDUNGEN:
--   * document_id ist KEIN FK (nur uuid). Das Archiv soll den versendeten Stand
--     unabhängig festhalten — ein Cascade/Restrict von der Quelle darf das
--     Archiv nie berühren.
--   * document_type (invoice/delivery_note/correction) wird app-seitig validiert,
--     KEIN DB-CHECK — die Korrektur (S7) kommt additiv ohne Constraint-Swap.
--   * unique(org_id, document_type, document_id) = höchstens EIN Archiv je Beleg
--     (Idempotenz-Backstop; ein zweiter Archivierungsversuch läuft ins Leere).
--
-- Multi-Tenant: org_id + RLS (org_id = auth_org_id()); org_id ist zugleich das
-- erste Pfad-Segment im Bucket (RLS-Anker der storage-Policies).
-- ============================================================================

create table if not exists belege_archiv (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id),
  document_type  text not null,        -- invoice | delivery_note | correction (app-validiert)
  document_id    uuid not null,        -- Quell-Beleg (KEIN FK, s. o.)
  belegnummer    text not null,        -- Snapshot der Belegnummer
  dealer_name    text,                 -- Snapshot des Kundennamens
  beleg_datum    date,                 -- Snapshot des Belegdatums
  storage_path   text not null,        -- Pfad im Bucket belege-archiv
  content_type   text,                 -- MIME (application/pdf)
  file_size      bigint,               -- Bytes (Anzeige)
  created_by     uuid references profiles(id),
  created_at     timestamptz default now()
);

create index if not exists idx_belege_archiv_org on belege_archiv(org_id);
create index if not exists idx_belege_archiv_doc on belege_archiv(document_type, document_id);

-- Höchstens EIN Archiveintrag je Beleg (Idempotenz-Backstop).
create unique index if not exists uq_belege_archiv_document
  on belege_archiv(org_id, document_type, document_id);

alter table belege_archiv enable row level security;

-- NUR select + insert — bewusst KEINE update-/delete-Policy (unveränderbar).
drop policy if exists "belege_archiv_select" on belege_archiv;
create policy "belege_archiv_select" on belege_archiv for select
  using (org_id = auth_org_id());

drop policy if exists "belege_archiv_insert" on belege_archiv;
create policy "belege_archiv_insert" on belege_archiv for insert
  with check (org_id = auth_org_id());


-- ─── Storage-Bucket "belege-archiv" (PRIVAT, write-once) ────────────────────
insert into storage.buckets (id, name, public)
values ('belege-archiv', 'belege-archiv', false)
on conflict (id) do nothing;

-- Objekt-Policies: nur die eigene Org (erstes Pfad-Segment = org_id).
-- NUR select + insert — KEIN update (kein Überschreiben) und KEIN delete.
drop policy if exists "belege_archiv_obj_select" on storage.objects;
create policy "belege_archiv_obj_select" on storage.objects for select
  using (bucket_id = 'belege-archiv' and (storage.foldername(name))[1] = auth_org_id()::text);

drop policy if exists "belege_archiv_obj_insert" on storage.objects;
create policy "belege_archiv_obj_insert" on storage.objects for insert
  with check (bucket_id = 'belege-archiv' and (storage.foldername(name))[1] = auth_org_id()::text);
