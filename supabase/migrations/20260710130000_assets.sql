-- ============================================================================
-- DOKUMENTATION — NICHT AUSFÜHREN
-- Diese Tabellen wurden bereits direkt im Supabase SQL Editor angelegt,
-- ebenso die Storage-Buckets "assets" (privat) und "crops" (öffentlich).
-- Diese Datei hält den Stand nur zur Nachvollziehbarkeit im Repo fest
-- (Regel: "Migrations statt Klicken. Schemaänderungen als SQL").
-- RLS-Policies für assets/asset_dealers sowie die Storage-Policies sind
-- serverseitig vorhanden (org-/rollen-scoped) und hier nicht abgebildet.
-- ============================================================================

create table assets (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  filename      text not null,
  storage_path  text not null,
  mime_type     text not null default 'image/jpeg',
  file_size     integer,
  width         integer,
  height        integer,
  asset_kind    text not null default 'photo' check (asset_kind in ('photo', 'video')),
  asset_type    text not null default 'product' check (asset_type in ('product', 'lifestyle', 'campaign', 'lookbook')),
  product_id    uuid references products(id),
  season_id     uuid references seasons(id),
  status        text default 'done' check (status in ('uploading', 'processing', 'done', 'error')),
  created_at    timestamptz default now()
);

create table asset_dealers (
  asset_id      uuid not null references assets(id) on delete cascade,
  dealer_id     uuid not null references dealers(id) on delete cascade,
  assigned_at   timestamptz default now(),
  assigned_by   uuid references profiles(id),
  primary key (asset_id, dealer_id)
);

-- Referenz (bereits vorhanden): Saisons je Organisation.
create table seasons (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  code          text not null,
  label         text not null,
  is_active     boolean default false,
  created_at    timestamptz default now(),
  unique(org_id, code)
);
