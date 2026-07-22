-- S8 Fehlerhafte Retouren — reine Dokumentation (Anforderung 6.1)
--
-- Doku von Mangel-Retouren an den Lieferanten: welcher Artikel, Bezug zu
-- Rechnung/LS, Menge, welcher Lieferant, Wert ZWEIFACH (EK Nepal + VK), optional
-- eine Mangel-Notiz. BEWUSST ohne Folgeprozesse, ohne Auswertung, ohne
-- Nummernkreis — nur Erfassen + Liste. Kein Eingriff in bestehende Belege oder
-- Geld-Pfade.
--
-- Der Bezug (beleg_bezug) ist FREITEXT (Rechnungs-/LS-Nummer o. Ä.), nicht als
-- FK modelliert: für eine reine Doku ohne Folgelogik genügt der Verweis, und ein
-- FK-Zwang würde die Erfassung unnötig verkomplizieren (kann später additiv als
-- FK nachgezogen werden, falls eine Auswertung dazukommt).
--
-- Rein additiv & idempotent. Neue, leere Tabelle mit org_id + RLS wie überall.

create table if not exists defect_returns (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id),
  product_id    uuid references products(id),   -- optionaler Artikel-Verweis
  article_text  text,                           -- Bezeichnung (Snapshot/Freitext)
  color         text,
  size          text,
  quantity      integer not null default 0,
  producer_id   uuid references producers(id),  -- Lieferant
  beleg_bezug   text,                           -- Bezug Rechnung/LS (Freitext)
  value_ek      numeric(10,2),                  -- EK Nepal (Einkaufswert)
  value_vk      numeric(10,2),                  -- VK-Preis (Verkaufswert)
  defect_note   text,                           -- optionale Mangel-Notiz
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
);

create index if not exists idx_defect_returns_org on defect_returns(org_id);

alter table defect_returns enable row level security;

drop policy if exists "defect_returns_select" on defect_returns;
create policy "defect_returns_select" on defect_returns for select
  using (org_id = auth_org_id());

drop policy if exists "defect_returns_insert" on defect_returns;
create policy "defect_returns_insert" on defect_returns for insert
  with check (org_id = auth_org_id());

drop policy if exists "defect_returns_delete" on defect_returns;
create policy "defect_returns_delete" on defect_returns for delete
  using (org_id = auth_org_id());
