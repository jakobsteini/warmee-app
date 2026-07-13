-- ============================================================================
-- SCHEMA-ANPASSUNG — Echtdaten-Vorbereitung (NUR Schema, KEIN Datenimport)
-- Ergänzt dealers und products, damit die realen Kundendaten (FW26) und der
-- Artikelstamm (SS27) abbildbar sind. Der Import erfolgt in einem späteren
-- Schritt und befüllt die hier angelegten (nullable) Spalten.
--
-- Diese Migration MUSS ausgeführt werden — Supabase SQL Editor / Management API,
-- Projekt wyddahfnxiilootylcwg. Voraussetzung: Tabellen dealers, products
-- bestehen bereits.
--
-- HARTE REGELN (eingehalten):
--   * REIN ADDITIV — nur ADD COLUMN / CREATE SEQUENCE / CREATE INDEX /
--     ALTER COLUMN SET DEFAULT. Kein DROP, kein RENAME, kein Typwechsel an
--     bestehenden Spalten.
--   * Alle neuen Spalten NULLABLE (Import füllt sie später).
--   * Multi-Tenant intakt: es werden KEINE neuen Tabellen angelegt (Adressen
--     inline), daher keine neuen RLS-Policies nötig — die neuen Spalten
--     unterliegen der bereits aktiven org-/rollen-scoped RLS von dealers bzw.
--     products. Bestehende RLS wird NICHT verändert.
--   * Idempotent / re-runnable: IF NOT EXISTS bzw. SET DEFAULT überall.
--
-- Quellen:
--   docs/Kundendaten_Order Übersicht pro Kunde FW26.xlsx  (Blatt "Kundendaten", 33 Spalten, 146 Händler)
--   docs/Artiekl SS27.xlsx                                (Blatt "Tabelle1", 13 Spalten, 52 Artikel)
-- ============================================================================


-- ─── DEALERS: Kundennummer ──────────────────────────────────────────────────
-- Bestehende Import-Kunden behalten ihre echte KundenNr. (in den Daten max.
-- 92803; laut Auftraggeber bis 92835). NEU angelegte Händler erhalten per
-- Default eine Nummer aus einer Sequence ab 92836.
--
-- Wichtig: Spalte OHNE Default hinzufügen (bestehende Zeilen -> NULL, kein
-- Table-Rewrite, keine Sequence-Werte verbraucht). Default erst danach setzen,
-- damit er nur für KÜNFTIGE Inserts gilt. Der Import setzt die echten Nummern
-- explizit -> die Sequence wird dabei nicht weitergezählt, keine Kollision.
create sequence if not exists dealers_kundennummer_seq start with 92836;

alter table dealers
  add column if not exists kundennummer integer;

alter table dealers
  alter column kundennummer set default nextval('dealers_kundennummer_seq');

-- Sequence sauber an die Spalte binden (ändert keine Daten).
alter sequence dealers_kundennummer_seq owned by dealers.kundennummer;

-- Eindeutig je Organisation (Multi-Tenant). Mehrere NULLs bleiben erlaubt,
-- daher blockt der Index den Vor-Import-Zustand nicht.
create unique index if not exists dealers_org_kundennummer_uniq
  on dealers (org_id, kundennummer);


-- ─── DEALERS: Stammdaten, Steuer & Zahlungskonditionen ──────────────────────
alter table dealers
  add column if not exists short_name         text,          -- Kunde Kurzname
  add column if not exists company_name        text,          -- Firmen Name
  add column if not exists owner_name          text,          -- Inhaber
  add column if not exists uid                 text,          -- UID-Nr. (Umsatzsteuer-ID, z. B. ATU61622989)
  add column if not exists gegenkonto          integer,       -- GegenKto. (Buchhaltungs-Gegenkonto)
  -- Zahlungskonditionen: Rohstring JETZT (Referenz). Die strukturierten Felder
  -- werden in DIESEM Schritt nur angelegt und bleiben leer — Parsen/Befüllen
  -- macht Schritt 3 (Geld-Logik).
  add column if not exists payment_terms_raw   text,          -- z. B. "4,00%10T N30T", "N30T", "Netto sofort"
  add column if not exists skonto_prozent      numeric(5,2),
  add column if not exists skonto_tage         integer,
  add column if not exists zahlungsziel_tage   integer;


-- ─── DEALERS: 3 Adresstypen (inline) ────────────────────────────────────────
-- Entscheidung: inline-Spalten statt separater dealer_addresses-Tabelle.
-- Begründung: Es gibt genau DREI feste, im Voraus bekannte Adresstypen
-- (Liefer/Rechnung/Store). Die Kardinalität ist fix (1:1 je Händler), die
-- Adressen werden immer zusammen mit dem Händler geladen. Eine eigene Tabelle
-- lohnt nur bei unbegrenzt vielen/variablen Adressen; hier brächte sie nur
-- Joins, eine zweite RLS-Policy und mehr Komplexität ohne Nutzen. Daher inline
-- mit klaren Präfixen shipping_/billing_/store_.
-- PLZ als TEXT (Auslandskunden CH/UK/USA/NOR haben alphanumerische Codes).

-- Lieferadresse (Excel: LS-*)
alter table dealers
  add column if not exists shipping_street        text,
  add column if not exists shipping_zip           text,
  add column if not exists shipping_city          text,
  add column if not exists shipping_country_code  text,       -- z. B. "A (EU)", "CH", "USA"
  add column if not exists shipping_country_name  text,       -- z. B. "Austria"
  add column if not exists shipping_phone         text,
  add column if not exists shipping_email         text,       -- LS-Email1
  add column if not exists shipping_email2        text;       -- LS Email 2

-- Rechnungsadresse (Excel: Re-*)
alter table dealers
  add column if not exists billing_name           text,       -- Re-Name1
  add column if not exists billing_street         text,
  add column if not exists billing_zip            text,
  add column if not exists billing_city           text,
  add column if not exists billing_country_code   text,
  add column if not exists billing_country_name   text,
  add column if not exists billing_phone          text,
  add column if not exists billing_email          text;       -- Re-Email1

-- Store-/POS-Adresse (Excel: Store Name, POS-*)
alter table dealers
  add column if not exists store_name             text,       -- Store Name
  add column if not exists store_street           text,
  add column if not exists store_zip              text,
  add column if not exists store_city             text,
  add column if not exists store_country_code     text,
  add column if not exists store_country_name     text,
  add column if not exists store_phone            text,
  add column if not exists store_email            text;       -- POS-Email1

-- Bewusst NICHT als dealers-Spalten übernommen: "AuftrDatum" und "Bemerkung".
-- Sie beschreiben die jeweilige Order (Blatt "Order Übersicht"), nicht den
-- Händler-Stammdatensatz, und gehören fachlich zu orders.


-- ─── PRODUCTS: Preisebenen EK / WHS / RTL ───────────────────────────────────
-- Bestehend und UNANGETASTET: wholesale_price = WHS, retail_price = RTL.
-- Fehlt bisher: EK (Einkaufspreis vom Produzenten, Excel "price shangrila").
alter table products
  add column if not exists purchase_price numeric(10,2);      -- EK (Excel: price shangrila)


-- ─── PRODUCTS: Composition / Style & Strick-Spezifikation ───────────────────
-- Als TEXT gehalten, da die Excel Rohwerte mit Einheiten führt (z. B. "14gg",
-- "122gms", "42/2"); strukturiertes Parsen ist hier nicht Aufgabe.
alter table products
  add column if not exists style       text,   -- Style (Artikelbezeichnung des Produzenten)
  add column if not exists composition text,   -- Composition, z. B. "100% cashmere"
  add column if not exists gauge       text,   -- gg,  z. B. "14gg"
  add column if not exists ply         text,   -- ply, z. B. "1 ply"
  add column if not exists yarn_count  text,   -- Yarn count, z. B. "42/2"
  add column if not exists weight      text,   -- weight, z. B. "122gms"
  add column if not exists note        text;   -- NOTE
