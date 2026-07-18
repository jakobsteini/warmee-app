-- ============================================================================
-- LAGER — Bewegungskonto (inventory_movements) + berechneter Ist-Bestand (View)
-- Baustein „Lager" (2026-07-18). Anforderung Theresa: Online- und Bestandslager,
-- manuelle Erfassung durch Mitarbeiter, Kopplung an den Lieferschein
-- (Warenausgang), Kunden-Lagerliste als PDF (später).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. Rein additiv & idempotent:
-- nur CREATE TABLE/INDEX/VIEW IF NOT EXISTS bzw. drop-if-exists + add für die
-- wideable Constraints/Policies (wie in der product_variants-Migration). Kein
-- DROP einer Tabelle/Spalte, kein RENAME, kein Typwechsel. Es entsteht EINE neue
-- Tabelle + EINE View; die Echtdaten (128 Händler, 48 Artikel SS27) bleiben
-- unberührt.
--
-- Fachliche Grundentscheidungen (mit Jakob abgestimmt, Q1–Q5):
--   Q1  BEWEGUNGSKONTO, kein Bestandsfeld. Jede Buchung ist eine append-only
--       Zeile; der Ist-Bestand wird als SUMME berechnet (View inventory_stock).
--       Bestand wird NIE direkt überschrieben — Korrektur = neue Zeile
--       (grund='korrektur'). Analog zu goods_receipts/getReconciliation.
--   Q2  Lieferschein-Abgang wird MANUELL vom Mitarbeiter bestätigt (Ein-Klick-
--       Ausbuchung mit Vorschlagsmenge, App-seitig, verankert an delivery_id).
--       Der Nepal-Wareneingang bucht NICHT automatisch in den Bestand.
--   Q3  Zwei Lager als Dimension: warehouse ∈ ('online','bestand').
--   Q4  Retouren-Variante B UNBERÜHRT: kein Rückweg ins Lager. Das grund-Vokabular
--       ist bewusst wideable gehalten (drop-if-exists/add), falls Theresa später
--       einen expliziten Retouren-Zugang will — hier NICHT gebaut.
--   Q5  variant_id NULLABLE als Teil der Bestandsidentität. Composite-FK
--       garantiert DB-seitig, dass die Variante zum product_id gehört (wie bei
--       assets). Die Variante wird nur MANUELL gesetzt (Zugang + Abgangs-
--       Bestätigung), nie vom Automatik-Vorschlag geraten — der Vorschlag
--       matcht auf product_id+color+size (deckungsgleich mit delivery_items) und
--       lässt variant_id null. Ob die Variante Pflicht wird, entscheidet Theresa
--       später; das Schema erzwingt nichts (nullable).
--
-- Multi-Tenant: inventory_movements trägt org_id + die üblichen vier RLS-Policies
-- (org_id = auth_org_id()). org_id wird app-seitig beim Insert gesetzt.
--
-- OFFEN (bewusst NICHT hier gelöst): color/size sind Freitext — "Camel" vs
-- "camel" wären getrennte Bestandszeilen. Strukturierte Farben/Größen sind ein
-- eigener späterer Baustein; das Lager startet mit dem bestehenden Freitext.
-- ============================================================================


-- ─── Bewegungskonto: eine append-only Zeile je Buchung ──────────────────────
-- menge ist VORZEICHENBEHAFTET: + = Zugang, − = Abgang. 0 ist keine Bewegung.
-- product_id ist Pflicht (eine Bestandszeile hängt immer an einem Artikel);
-- color/size sind nullable Freitext wie in order_items/delivery_items.
create table if not exists inventory_movements (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organizations(id),
  product_id   uuid not null references products(id),
  variant_id   uuid,                         -- nullable; Composite-FK unten
  color        text,
  size         text,
  warehouse    text not null,                -- Vokabular per CHECK unten (wideable)
  menge        integer not null check (menge <> 0),
  grund        text not null,                -- Vokabular per CHECK unten (wideable)
  delivery_id  uuid references deliveries(id),  -- gesetzt bei grund='lieferschein'
  created_by   uuid references profiles(id),
  created_at   timestamptz default now()
);

-- ─── warehouse-Vokabular (wideable: drop-if-exists + add) ───────────────────
alter table inventory_movements drop constraint if exists inventory_movements_warehouse_chk;
alter table inventory_movements add  constraint inventory_movements_warehouse_chk
  check (warehouse in ('online', 'bestand'));

-- ─── grund-Vokabular (wideable) ─────────────────────────────────────────────
-- Bewusst eng auf die heute genutzten Gründe. Erweiterung (z.B. 'umlagerung' für
-- Lager-zu-Lager oder ein späterer Retouren-Zugang) ist ein reines Weiten dieses
-- CHECK — additiv, ohne Tabellenumbau.
alter table inventory_movements drop constraint if exists inventory_movements_grund_chk;
alter table inventory_movements add  constraint inventory_movements_grund_chk
  check (grund in ('manuell', 'lieferschein', 'korrektur', 'umlagerung'));

-- ─── Composite-FK: variant_id MUSS zum product_id gehören (wie assets) ───────
-- Ziel-Unique uq_product_variants_id_product (id, product_id) existiert bereits
-- aus 20260717170000_product_variants.sql. MATCH SIMPLE: ist variant_id NULL,
-- greift der FK nicht → normale Bestandszeile ohne Variante. ON DELETE RESTRICT:
-- eine Variante mit Bestandsbewegungen kann nicht gelöscht werden (kein stilles
-- Verwaisen).
alter table inventory_movements drop constraint if exists inventory_movements_variant_fk;
alter table inventory_movements add  constraint inventory_movements_variant_fk
  foreign key (variant_id, product_id)
  references product_variants (id, product_id)
  on delete restrict;

-- ─── Indizes ────────────────────────────────────────────────────────────────
create index if not exists idx_inventory_movements_org      on inventory_movements(org_id);
create index if not exists idx_inventory_movements_product  on inventory_movements(product_id);
create index if not exists idx_inventory_movements_delivery on inventory_movements(delivery_id);
-- Aggregations-Index für den Ist-Bestand (View gruppiert genau nach dieser Achse):
create index if not exists idx_inventory_movements_dim
  on inventory_movements(org_id, product_id, warehouse, color, size, variant_id);

-- ─── RLS wie überall (vier Policies, org_id = auth_org_id()) ─────────────────
-- Die App behandelt die Tabelle append-only (Korrektur = neue Zeile). Die
-- update/delete-Policies existieren nur der Konsistenz halber („RLS wie überall").
alter table inventory_movements enable row level security;
drop policy if exists "inventory_movements_select" on inventory_movements;
drop policy if exists "inventory_movements_insert" on inventory_movements;
drop policy if exists "inventory_movements_update" on inventory_movements;
drop policy if exists "inventory_movements_delete" on inventory_movements;
create policy "inventory_movements_select" on inventory_movements for select using (org_id = auth_org_id());
create policy "inventory_movements_insert" on inventory_movements for insert with check (org_id = auth_org_id());
create policy "inventory_movements_update" on inventory_movements for update using (org_id = auth_org_id());
create policy "inventory_movements_delete" on inventory_movements for delete using (org_id = auth_org_id());


-- ─── View: Ist-Bestand als Summe je Dimension ──────────────────────────────
-- KEINE Bestandstabelle — der Ist-Bestand ist immer die Summe der Bewegungen.
-- security_invoker = true (Postgres 15+): die View wendet die RLS von
-- inventory_movements des ABFRAGENDEN Nutzers an. OHNE das würde die View mit
-- den Rechten des Owners laufen und RLS umgehen → org-übergreifendes Leck.
-- Zwingend für Multi-Tenant.
--
-- bestand ist vorzeichenbehaftet und wird NICHT geklammert: ein negativer Wert
-- (mehr aus- als eingebucht) ist ein echter Sachverhalt, den die App sichtbar
-- machen soll — kein Clamp (Haus-Linie, vgl. net_base bei der Provision).
-- Zeilen mit bestand = 0 (netto leer) bleiben bewusst erhalten; die App filtert
-- bei Bedarf.
create or replace view inventory_stock
with (security_invoker = true) as
select
  org_id,
  product_id,
  variant_id,
  color,
  size,
  warehouse,
  sum(menge)::int as bestand
from inventory_movements
group by org_id, product_id, variant_id, color, size, warehouse;
