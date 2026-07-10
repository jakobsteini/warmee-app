-- ============================================================================
-- DOKUMENTATION — NICHT AUSFÜHREN
-- Diese Tabelle wurde bereits direkt im Supabase SQL Editor angelegt,
-- ebenso der Storage-Bucket "crops" (public).
-- Diese Datei hält den Stand nur zur Nachvollziehbarkeit im Repo fest
-- (Regel: "Migrations statt Klicken. Schemaänderungen als SQL").
-- RLS-Policies für crops sowie die Storage-Policies des crops-Buckets
-- sind serverseitig vorhanden (org-/rollen-scoped über das verknüpfte Asset)
-- und hier nicht abgebildet.
-- ============================================================================

create table crops (
  id            uuid primary key default uuid_generate_v4(),
  asset_id      uuid not null references assets(id) on delete cascade,
  format        text not null check (format in ('4:5', '3:4', '9:16', 'newsletter')),
  x             integer not null,
  y             integer not null,
  w             integer not null,
  h             integer not null,
  output_path   text,
  created_at    timestamptz default now(),
  unique(asset_id, format)
);
