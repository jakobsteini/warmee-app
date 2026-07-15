-- ============================================================================
-- DOKUMENTENABLAGE JE KUNDE — Verträge & Vereinbarungen je Händler
-- Quelle: Systemanforderungen WARM ME, Abschnitt 12 (Kundenverwaltung).
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, dealers, profiles sowie
-- die Funktion auth_org_id() bestehen bereits.
--
-- REIN ADDITIV & idempotent: nur CREATE TABLE IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS / (drop policy if exists +) CREATE POLICY / bucket-INSERT ON
-- CONFLICT DO NOTHING. Kein DROP einer Tabelle/Spalte, kein RENAME, kein
-- Typwechsel, keine bestehende Tabelle verändert. Die Echtdaten (128 Händler)
-- bleiben unberührt — hier entsteht eine neue leere Tabelle + ein neuer Bucket.
--
-- VERTRAULICHKEIT (zentral):
--   * Verträge sind vertrauliche Kundendokumente. Der Bucket ist deshalb
--     PRIVAT (public = false) — das genaue Gegenteil von newsletter-assets.
--     Auslieferung ausschließlich über Signed URLs (app-seitig, createSignedUrl),
--     nie über getPublicUrl. Muster übernommen vom invoices-Bucket.
--   * Zugriff nur für eingeloggte Nutzer der EIGENEN Org: sowohl die
--     Metadaten-Tabelle (RLS org_id = auth_org_id()) als auch die Dateien im
--     Bucket (storage.objects-Policies gescoped auf den org_id-Ordner).
--
-- BEWUSSTE ENTSCHEIDUNGEN:
--   * dealer_id ist ein FK OHNE `on delete cascade`. Wie orders/invoices/
--     deliveries blockt das die Löschung eines Händlers, solange Dokumente
--     vorliegen. Grund: Ein Cascade würde die Metadaten-Zeilen löschen, aber
--     NICHT die Dateien im Bucket — vertrauliche Verträge blieben als
--     unauffindbare, DSGVO-relevante Karteileichen liegen. Blockieren ist das
--     ehrlichere Verhalten (die App zeigt eine klare Meldung). Saubere
--     Gesamtlösung: die DSGVO-Löschfunktion (eigener Baustein).
--   * category (Vertrag/Vereinbarung/Sonstiges) wird BEWUSST app-seitig
--     validiert (TS-Union), NICHT per DB-CHECK. So ist eine spätere Kategorie
--     eine reine Code-Änderung und kein destruktiver Constraint-Swap
--     (additiv-freundlich, siehe Migrations-Konvention).
--   * Dokumente sind unveränderlich (keine Versionierung, kein Edit) → keine
--     update-Policy, kein updated_at. Falsche Datei = löschen + neu hochladen.
--
-- Multi-Tenant: dealer_documents trägt org_id + RLS (org_id = auth_org_id()).
-- org_id wird app-seitig beim Insert gesetzt.
-- ============================================================================


-- ─── Dokument-Metadaten je Händler ──────────────────────────────────────────
-- storage_path = Pfad im Bucket, Konvention <org_id>/<dealer_id>/<uuid>-<datei>.
-- Der org_id-Ordner (erstes Segment) ist der RLS-Anker der storage-Policies.
create table if not exists dealer_documents (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  dealer_id     uuid not null references dealers(id),  -- KEIN cascade (s. o.)
  file_name     text not null,        -- Original-Dateiname (Anzeige)
  category      text not null,        -- app-seitig validiert, kein DB-CHECK
  content_type  text,                 -- MIME-Typ (Icon/Anzeige)
  file_size     bigint,               -- Dateigröße in Bytes (Anzeige)
  storage_path  text not null,        -- Pfad im Bucket dealer-documents
  created_by    uuid references profiles(id),  -- wer hochgeladen hat
  created_at    timestamptz default now()      -- Upload-Datum
);

create index if not exists idx_dealer_documents_org    on dealer_documents(org_id);
create index if not exists idx_dealer_documents_dealer on dealer_documents(dealer_id);

alter table dealer_documents enable row level security;

-- select/insert/delete — kein update (Dokumente sind unveränderlich).
drop policy if exists "dealer_documents_select" on dealer_documents;
create policy "dealer_documents_select" on dealer_documents for select
  using (org_id = auth_org_id());

drop policy if exists "dealer_documents_insert" on dealer_documents;
create policy "dealer_documents_insert" on dealer_documents for insert
  with check (org_id = auth_org_id());

drop policy if exists "dealer_documents_delete" on dealer_documents;
create policy "dealer_documents_delete" on dealer_documents for delete
  using (org_id = auth_org_id());


-- ─── Storage-Bucket "dealer-documents" (PRIVAT) ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('dealer-documents', 'dealer-documents', false)
on conflict (id) do nothing;

-- Objekt-Policies: nur die eigene Org (erstes Pfad-Segment = org_id).
-- select/insert/delete — kein update (kein upsert, jede Datei ist eigen).
drop policy if exists "dealer_docs_obj_select" on storage.objects;
create policy "dealer_docs_obj_select" on storage.objects for select
  using (bucket_id = 'dealer-documents' and (storage.foldername(name))[1] = auth_org_id()::text);

drop policy if exists "dealer_docs_obj_insert" on storage.objects;
create policy "dealer_docs_obj_insert" on storage.objects for insert
  with check (bucket_id = 'dealer-documents' and (storage.foldername(name))[1] = auth_org_id()::text);

drop policy if exists "dealer_docs_obj_delete" on storage.objects;
create policy "dealer_docs_obj_delete" on storage.objects for delete
  using (bucket_id = 'dealer-documents' and (storage.foldername(name))[1] = auth_org_id()::text);
