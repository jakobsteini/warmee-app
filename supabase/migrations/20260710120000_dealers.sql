-- ============================================================================
-- DOKUMENTATION — NICHT AUSFÜHREN
-- Diese Tabelle wurde bereits direkt im Supabase SQL Editor angelegt.
-- Diese Datei hält den Stand nur zur Nachvollziehbarkeit im Repo fest
-- (Regel: "Migrations statt Klicken. Schemaänderungen als SQL").
-- RLS-Policies für dealers sind serverseitig vorhanden (org-/rollen-scoped)
-- und hier nicht abgebildet.
-- ============================================================================

create table dealers (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  name          text not null,
  contact_name  text,
  email         text,
  city          text,
  country       text default 'AT',
  agent_id      uuid references profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
