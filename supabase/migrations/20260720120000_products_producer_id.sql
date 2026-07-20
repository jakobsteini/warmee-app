-- ============================================================================
-- ARTIKEL ↔ LIEFERANT (products.producer_id) + Seed fehlender Lieferanten
-- Baustein B1 (2026-07-20). Fundament für die Lieferanten-Order (Thema 4): jeder
-- Artikel bekommt einen Lieferanten (producers), damit die spätere
-- Lieferanten-Order-Filterung Positionen je Lieferant selektieren kann.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- nur ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / INSERT … WHERE NOT
-- EXISTS. Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung. Die
-- Echtdaten (128 Händler, 48 Artikel SS27) bleiben gültig — producer_id startet
-- NULL, die bestehende producers-Zeile „Shangri-La" bleibt unverändert.
--
-- Voraussetzung: Tabellen products, producers sowie auth_org_id() bestehen.
-- ============================================================================


-- ─── 1) products.producer_id — nullable FK auf producers ────────────────────
-- Nullable, kein Default: alle 48 bestehenden Artikel behalten producer_id NULL
-- („noch nicht zugeordnet"). Reine Metadaten-Operation, kein Table-Rewrite. Der
-- FK verweist nur auf gültige producers; NULL bleibt erlaubt. Die neue Spalte
-- unterliegt automatisch den bestehenden org-/rollen-scoped RLS-Policies von
-- products — keine neue Policy nötig.
alter table products
  add column if not exists producer_id uuid references producers(id);

create index if not exists idx_products_producer on products(producer_id);


-- ─── 2) Seed: fehlende Lieferanten in producers ─────────────────────────────
-- Die bestehende Zeile „Shangri-La" (NP) bleibt unangetastet. Ergänzt werden die
-- feineren Lieferanten, auf die die Artikel künftig zeigen. Schreibweise
-- durchgängig „Shangri-La …" mit Bindestrich, konsistent zur bestehenden Zeile.
--
-- org_id wird NICHT hardcodiert, sondern aus der vorhandenen „Shangri-La"-Zeile
-- abgeleitet (Subquery sl). WHERE NOT EXISTS je (org_id, name) macht den Seed
-- idempotent — erneuter Lauf fügt nichts doppelt ein.
insert into producers (org_id, name, country, active)
select sl.org_id, v.name, v.country, true
from (select org_id from producers where name = 'Shangri-La' limit 1) sl
cross join (values
  ('Shangri-La Scarf',       'NP'),
  ('Shangri-La Sweater',     'NP'),
  ('Shangri-La SW',          'NP'),
  ('Shangri-La Additionals', 'NP'),
  ('Shangri-La Kids',        'NP'),
  ('Red Street Textiles',    'PT')
) as v(name, country)
where not exists (
  select 1 from producers p
  where p.org_id = sl.org_id and p.name = v.name
);
