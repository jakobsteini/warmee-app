-- ============================================================================
-- MAHNWESEN — Inkasso-Übergabe + In-App-Benachrichtigungen
-- Quelle: Systemanforderungen WARM ME, Abschnitt 8.2 (Mahnwesen), Erweiterung.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg). Voraussetzung: organizations, invoices, dealers,
-- profiles sowie auth_org_id() und update_updated_at() bestehen bereits.
--
-- REIN ADDITIV: nur CREATE TABLE / CREATE INDEX. Kein DROP, kein RENAME, kein
-- Typwechsel, KEINE Änderung an bestehenden Constraints. Idempotent.
--
-- Fachlich zentral:
--   * Der Status „Inkasso" wird NICHT als neuer Wert in invoices.status
--     geschrieben (das hieße den bestehenden CHECK-Constraint ändern — nicht
--     additiv, berührt Echtdaten). Stattdessen ist „Inkasso" ABGELEITET: eine
--     Rechnung ist in Inkasso, solange ein dunning_collections-Fall mit
--     status='active' zu ihr existiert. Konsistent mit „ableiten statt
--     speichern" (wie die erreichte Mahnstufe).
--   * Snapshot-Muster wie bei Provisionsabrechnung / dunning_history: offener
--     Betrag, erreichte Stufe und Bezeichnung werden bei der Übergabe
--     EINGEFROREN, damit spätere Zahlungen/Konfig-Änderungen den dokumentierten
--     Inkasso-Fall nicht rückwirkend verfälschen.
--   * Kein Löschen: eine Rücknahme setzt status='withdrawn' + Grund/Benutzer,
--     der Vorgang bleibt als Historie stehen. Deshalb ist KEINE delete-Policy
--     vergeben (Löschen ist app- und DB-seitig nicht vorgesehen).
--   * notifications hält channel + sent_at bereits vor (aktuell nur 'in_app',
--     sent_at ungenutzt), damit ein späterer E-Mail-Versand OHNE weitere
--     Migration andocken kann.
-- Multi-Tenant: beide Tabellen mit org_id + denselben RLS-Policies wie der Rest
-- (org_id = auth_org_id()); org_id wird app-seitig beim Insert gesetzt.
-- ============================================================================


-- ─── (a) Inkasso-Fall (eingefrorener Snapshot je Übergabe) ──────────────────
-- Eine Zeile je Übergabe. Übergabe: status='active'. Rücknahme: dieselbe Zeile
-- auf status='withdrawn' + withdrawn_at/by + withdrawal_reason. Eine erneute
-- Übergabe nach Rücknahme legt eine NEUE Zeile an → volle Historie.
create table if not exists dunning_collections (
  id                    uuid primary key default uuid_generate_v4(),
  org_id                uuid not null references organizations(id),
  invoice_id            uuid not null references invoices(id) on delete cascade,
  dealer_id             uuid not null references dealers(id),
  -- Snapshot zum Übergabezeitpunkt (eingefroren):
  open_amount_snapshot  numeric(12,2) not null default 0,
  level_number_snapshot integer not null,
  label_snapshot        text not null,
  handed_over_at        timestamptz not null default now(),
  handed_over_by        uuid references profiles(id),
  -- Zustand + Rücknahme:
  status                text not null default 'active'
                        check (status in ('active', 'withdrawn')),
  withdrawn_at          timestamptz,
  withdrawn_by          uuid references profiles(id),
  withdrawal_reason     text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists idx_dunning_collections_org     on dunning_collections(org_id);
create index if not exists idx_dunning_collections_invoice on dunning_collections(invoice_id);
create index if not exists idx_dunning_collections_dealer  on dunning_collections(dealer_id);

-- Höchstens EIN aktiver Inkasso-Fall je Rechnung (partial unique — additiv,
-- verhindert Doppel-Übergabe, lässt beliebig viele withdrawn-Fälle zu).
create unique index if not exists uq_dunning_collections_active
  on dunning_collections(invoice_id) where status = 'active';

alter table dunning_collections enable row level security;

create policy "dunning_collections_select" on dunning_collections for select using (org_id = auth_org_id());
create policy "dunning_collections_insert" on dunning_collections for insert with check (org_id = auth_org_id());
create policy "dunning_collections_update" on dunning_collections for update using (org_id = auth_org_id());
-- BEWUSST keine delete-Policy: der Vorgang bleibt als Historie stehen.

create trigger trg_dunning_collections_updated before update on dunning_collections
  for each row execute function update_updated_at();


-- ─── (b) In-App-Benachrichtigungen ──────────────────────────────────────────
-- type    = z. B. 'collection_handover' | 'collection_withdrawn' (frei, kein
--           CHECK, damit neue Typen ohne Migration möglich sind).
-- link    = In-App-Ziel des Vorgangs (z. B. '/dunning' oder '/dealers/<id>').
-- read_at = NULL solange ungelesen.
-- channel = Zustellkanal; aktuell nur 'in_app'. sent_at bleibt vorerst NULL —
--           beide sind Vorrüstung für einen späteren E-Mail-Versand.
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id),
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  channel     text not null default 'in_app'
              check (channel in ('in_app', 'email')),
  read_at     timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz default now()
);

create index if not exists idx_notifications_org        on notifications(org_id);
create index if not exists idx_notifications_org_unread on notifications(org_id, read_at);
create index if not exists idx_notifications_created    on notifications(created_at desc);

alter table notifications enable row level security;

create policy "notifications_select" on notifications for select using (org_id = auth_org_id());
create policy "notifications_insert" on notifications for insert with check (org_id = auth_org_id());
create policy "notifications_update" on notifications for update using (org_id = auth_org_id());
create policy "notifications_delete" on notifications for delete using (org_id = auth_org_id());
