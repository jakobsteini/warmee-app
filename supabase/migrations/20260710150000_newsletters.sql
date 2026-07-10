-- ============================================================================
-- DOKUMENTATION — NICHT AUSFÜHREN
-- Diese Tabellen wurden bereits direkt im Supabase SQL Editor angelegt.
-- Diese Datei hält den Stand nur zur Nachvollziehbarkeit im Repo fest
-- (Regel: "Migrations statt Klicken. Schemaänderungen als SQL").
-- RLS-Policies für newsletters/newsletter_products sind serverseitig
-- vorhanden (org-/rollen-scoped) und hier nicht abgebildet.
-- Die Newsletter-Bilder werden als öffentliche URLs aus dem bereits
-- vorhandenen "crops"-Bucket (public) referenziert.
-- ============================================================================

create table newsletters (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  title         text not null,
  subject_line  text,
  preheader     text,
  dealer_id     uuid not null references dealers(id),
  season_id     uuid references seasons(id),
  hero_asset_id uuid references assets(id),
  status        text default 'draft' check (status in ('draft', 'ready', 'downloaded')),
  downloaded_at timestamptz,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table newsletter_products (
  id            uuid primary key default uuid_generate_v4(),
  newsletter_id uuid not null references newsletters(id) on delete cascade,
  asset_id      uuid not null references assets(id),
  product_id    uuid references products(id),
  position      integer not null default 0,
  caption       text
);
