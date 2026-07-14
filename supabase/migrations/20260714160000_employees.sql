-- ============================================================================
-- MODUL: Mitarbeiter-Roster (employees) für die "Wer bin ich"-Auswahl
--
-- Das Einstiegs-Overlay (Marken-Split → Mitarbeiter-Auswahl) ist eine reine
-- Persona-GESTE, KEIN Login und KEINE Rechteprüfung. Die feste Mitarbeiterliste
-- gehört daher NICHT in die Auth-Tabelle profiles (die an echte auth.users
-- hängt), sondern in eine eigene, entkoppelte Tabelle.
--
-- Das Frontend nutzt aktuell eine Konstante (src/lib/employees.ts) mit exakt
-- denselben Namen — es liest (noch) NICHT aus dieser Tabelle. Diese Migration
-- schafft die spätere DB-Anbindung; danach kann das Overlay auf ein SELECT
-- umgestellt werden.
--
-- REIN ADDITIV: neue Tabelle + org-scoped RLS (SELECT). Keine bestehende
-- Tabelle/Policy wird verändert. Idempotent (IF NOT EXISTS / ON CONFLICT).
--
-- NICHT AUTOMATISCH ANWENDEN. Wird separat im Supabase SQL Editor
-- (Projekt wyddahfnxiilootylcwg) ausgeführt. Voraussetzungen: organizations
-- und die Funktion auth_org_id() bestehen.
-- ============================================================================

create table if not exists employees (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  name        text not null,
  is_admin    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now(),
  unique (org_id, name)
);

create index if not exists idx_employees_org on employees(org_id);

alter table employees enable row level security;

-- Nur Lesen innerhalb der eigenen Org (die Persona-Auswahl ist keine Rechte-
-- prüfung; Pflege der Liste erfolgt über den SQL Editor / service role).
create policy "emp_select" on employees for select
  using (org_id = auth_org_id());

-- Fester erster Wurf: Admins (goldener Rand) oben, dann das Team.
-- Cross-Join auf die (einzige) Organisation; ON CONFLICT macht das Seed
-- idempotent (unique org_id,name).
insert into employees (org_id, name, is_admin, sort_order)
select o.id, e.name, e.is_admin, e.sort_order
from organizations o
cross join (values
  ('Theresa',     true,  1),
  ('Christian',   true,  2),
  ('Verena',      false, 3),
  ('Christopher', false, 4),
  ('Alina',       false, 5),
  ('Lena',        false, 6),
  ('Jakob',       false, 7),
  ('Daniela',     false, 8)
) as e(name, is_admin, sort_order)
on conflict (org_id, name) do nothing;
