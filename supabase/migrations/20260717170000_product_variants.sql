-- ============================================================================
-- Produkt-Varianten am Grundartikel (KEINE eigenen Artikel)
-- Baustein „Variantenfeld" (2026-07-17). Kundenentscheidung Theresa: es gibt
-- genau drei Varianten (shaded / flat dye / twisted); eine Variante gehört zu
-- EINEM Artikel, ein Artikel kann mehrere haben, ein Bild zeigt auf
-- (Artikel + Variante). Kein globales Vokabular (bei drei Werten unnötig).
--
-- Modell: Tabelle product_variants (Zeile je Artikel+Variante) + nullable
-- assets.variant_id. Die DB GARANTIERT über einen Composite-FK, dass die
-- Variante zum Grundartikel des Bildes gehört — nicht app-seitig.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Rein additiv/idempotent; org_id + RLS wie überall. Kein
-- Seed (Varianten werden im Artikel-Modul gepflegt).
--
-- Zur „kein DROP"-Regel: CHECK/FK/Policies lassen sich in Postgres nur per
-- drop-if-exists + add idempotent halten — das WEITET nur, macht keine
-- bestehende assets-Zeile ungültig (variant_id startet NULL).
-- ============================================================================

-- ─── Tabelle: eine Zeile je (Artikel, Variante) ─────────────────────────────
create table if not exists product_variants (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references organizations(id),
  product_id uuid not null references products(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

-- Ziel des Composite-FK von assets (id + product_id gemeinsam eindeutig):
create unique index if not exists uq_product_variants_id_product
  on product_variants (id, product_id);
-- Keine doppelte Variante je Artikel (case-insensitiv):
create unique index if not exists uq_product_variants_product_name
  on product_variants (product_id, lower(name));
create index if not exists idx_product_variants_org     on product_variants(org_id);
create index if not exists idx_product_variants_product on product_variants(product_id);

alter table product_variants enable row level security;
drop policy if exists "product_variants_select" on product_variants;
drop policy if exists "product_variants_insert" on product_variants;
drop policy if exists "product_variants_update" on product_variants;
drop policy if exists "product_variants_delete" on product_variants;
create policy "product_variants_select" on product_variants for select using (org_id = auth_org_id());
create policy "product_variants_insert" on product_variants for insert with check (org_id = auth_org_id());
create policy "product_variants_update" on product_variants for update using (org_id = auth_org_id());
create policy "product_variants_delete" on product_variants for delete using (org_id = auth_org_id());

-- ─── assets.variant_id: nullable, DB-garantierte Integrität ─────────────────
alter table assets
  add column if not exists variant_id uuid;

-- Variante nur zusammen mit einem Grundartikel (variant_id ⇒ product_id):
alter table assets drop constraint if exists assets_variant_needs_product;
alter table assets add  constraint assets_variant_needs_product
  check (variant_id is null or product_id is not null);

-- Composite-FK: die Variante MUSS zum product_id des Bildes gehören. Bei
-- variant_id = NULL greift der FK nicht (MATCH SIMPLE) → normales Artikelbild.
-- ON DELETE RESTRICT: eine Variante, auf die Bilder zeigen, kann nicht gelöscht
-- werden (kein stilles Verwaisen; erst Bilder umhängen).
alter table assets drop constraint if exists assets_variant_fk;
alter table assets add  constraint assets_variant_fk
  foreign key (variant_id, product_id)
  references product_variants (id, product_id)
  on delete restrict;
