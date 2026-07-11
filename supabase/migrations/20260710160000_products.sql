-- ============================================================================
-- DOKUMENTATION — NICHT AUSFÜHREN
-- Diese Tabelle wurde bereits direkt im Supabase SQL Editor angelegt.
-- Diese Datei hält den Stand nur zur Nachvollziehbarkeit im Repo fest
-- (Regel: "Migrations statt Klicken. Schemaänderungen als SQL").
-- RLS-Policies für products sind serverseitig vorhanden (org-/rollen-scoped)
-- und hier nicht abgebildet.
-- Referenziert von assets.product_id und newsletter_products.product_id.
-- ============================================================================

create table products (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id),
  name            text not null,
  category        text,
  color           text[],
  retail_price    numeric(10,2),
  wholesale_price numeric(10,2),
  season_id       uuid references seasons(id),
  created_at      timestamptz default now()
);
