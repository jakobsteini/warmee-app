-- ============================================================================
-- RETOUREN — positionsbasierte Retoure / Gutschrift (returns, return_items)
-- Variante B: Teilretouren je Rechnungsposition, OHNE Bestandskonto (Ware ist
-- für WARM ME mit der Retoure erledigt, kommt nicht zurück ins Lager).
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, invoices, invoice_items,
-- dealers, products, profiles sowie auth_org_id() und update_updated_at()
-- bestehen bereits.
--
-- REIN ADDITIV: nur CREATE TABLE / CREATE INDEX. Kein DROP, kein RENAME, kein
-- Typwechsel, KEINE Änderung an bestehenden Constraints. Idempotent.
--
-- Fachlich zentral:
--   * Verankerung an der RECHNUNG (invoice_id): offene Posten und die
--     Provisions-deductions hängen beide an der Rechnung; invoice_items tragen
--     Produkt/Farbe/Größe UND unit_price → die Gutschrift-Zeile bekommt
--     Menge × Preis geschenkt. Über invoices.delivery_id ist die Lieferung
--     weiterhin erreichbar.
--   * Snapshot-Muster wie bei Rechnung / Provisionsabrechnung: unit_price,
--     line_total und total_amount werden beim Erfassen EINGEFROREN, damit
--     spätere Änderungen an Rechnung/Produkt die dokumentierte Retoure nicht
--     rückwirkend verfälschen.
--   * Kein Löschen: eine Fehleingabe wird auf status='cancelled' + Grund/
--     Benutzer gesetzt, der Vorgang bleibt als Historie stehen (wie die
--     Inkasso-Rücknahme). Deshalb KEINE delete-Policy. Ein Storno zählt nicht
--     mehr zur offenen-Posten-Minderung und nicht zu den Provisions-Abzügen.
--   * credit_note_number und pdf_path sind VORGERÜSTET (nullable): der formale,
--     nummerierte Gutschrift-Beleg ist eine spätere additive Schicht und braucht
--     dann keine weitere Migration.
-- Multi-Tenant: org_id + dieselben RLS-Policies wie der Rest
-- (org_id = auth_org_id()); org_id wird app-seitig beim Insert gesetzt.
-- ============================================================================


-- ─── (a) Retouren-Kopf (ein Vorgang je Erfassung) ───────────────────────────
create table if not exists returns (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null references organizations(id),
  invoice_id           uuid not null references invoices(id) on delete cascade,
  dealer_id            uuid not null references dealers(id),
  return_date          date not null default current_date,
  reason               text,
  -- Eingefrorene Summe der Gutschrift-Zeilen (Snapshot):
  total_amount         numeric(10,2) not null default 0,
  -- Zustand + Storno (kein Löschen):
  status               text not null default 'recorded'
                       check (status in ('recorded', 'cancelled')),
  cancelled_at         timestamptz,
  cancelled_by         uuid references profiles(id),
  cancellation_reason  text,
  -- Beleg-Schicht, vorerst ungenutzt (späterer nummerierter Gutschrift-Beleg):
  credit_note_number   text,
  pdf_path             text,
  created_by           uuid references profiles(id),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists idx_returns_org     on returns(org_id);
create index if not exists idx_returns_invoice  on returns(invoice_id);
create index if not exists idx_returns_dealer   on returns(dealer_id);

-- Gutschrift-Nummer (sobald vergeben) eindeutig je Org; NULLs bleiben frei.
create unique index if not exists uq_returns_credit_note_number
  on returns(org_id, credit_note_number) where credit_note_number is not null;

alter table returns enable row level security;

create policy "returns_select" on returns for select using (org_id = auth_org_id());
create policy "returns_insert" on returns for insert with check (org_id = auth_org_id());
create policy "returns_update" on returns for update using (org_id = auth_org_id());
-- BEWUSST keine delete-Policy: der Vorgang bleibt als Historie stehen.

create trigger trg_returns_updated before update on returns
  for each row execute function update_updated_at();


-- ─── (b) Retouren-Positionen (je zurückgegebener Rechnungszeile) ─────────────
-- invoice_item_id verankert die Herkunftszeile; product_id/color/size/unit_price
-- sind als Snapshot dupliziert (überleben Quelländerung, wie invoice_items).
create table if not exists return_items (
  id               uuid primary key default uuid_generate_v4(),
  return_id        uuid not null references returns(id) on delete cascade,
  invoice_item_id  uuid not null references invoice_items(id) on delete cascade,
  product_id       uuid references products(id),
  color            text,
  size             text,
  quantity         integer not null,
  unit_price       numeric(10,2) not null,
  line_total       numeric(10,2) not null,
  created_at       timestamptz default now()
);

create index if not exists idx_return_items_return  on return_items(return_id);
create index if not exists idx_return_items_invitem on return_items(invoice_item_id);

alter table return_items enable row level security;

create policy "return_items_select" on return_items for select using (
  exists (select 1 from returns where returns.id = return_id and returns.org_id = auth_org_id())
);
create policy "return_items_insert" on return_items for insert with check (
  exists (select 1 from returns where returns.id = return_id and returns.org_id = auth_org_id())
);
