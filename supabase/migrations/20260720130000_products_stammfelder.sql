-- ============================================================================
-- ARTIKEL-STAMMFELDER erweitern: Staffel / Kollektion / Zuschlag
-- Baustein B3 (2026-07-20), Thema 1 (Artikelanlage). Drei unstrittige neue
-- Stammfelder am Artikel. Die „Gruppe" (products.category) ist NICHT Teil dieser
-- Migration — sie wartet auf Verenas finale Gruppen-Systematik (Auswertungs-
-- relevant) und kommt als eigener Schritt; category existiert bereits als Spalte.
-- Die „Qualität" ist ebenfalls nicht hier — sie nutzt das bestehende Feld
-- products.composition (nur UI, keine Schemaänderung).
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- eingespielt werden. Claude Code wendet sie NICHT an. REIN ADDITIV & idempotent:
-- ausschließlich ADD COLUMN IF NOT EXISTS auf der bestehenden Tabelle products.
-- Kein DROP, kein RENAME, kein Typwechsel, keine RLS-Änderung (products behält
-- seine bestehenden org-/rollen-scoped Policies). Die Echtdaten (128 Händler,
-- 48 Artikel SS27) bleiben gültig — alle drei Spalten sind nullable und starten
-- NULL.
--
-- Voraussetzung: Tabelle products besteht.
--
-- Fachliche Entscheidungen (mit Jakob abgestimmt):
--   * size_scheme  — benanntes Größen-Schema, reines Stamm-ETIKETT ('uni' |
--     'xs_2xl', erweiterbar). App-seitig validiert (TS-Union), KEIN DB-CHECK —
--     ein späteres Schema ist dann eine reine Code-Änderung, kein destruktiver
--     Constraint-Swap (Muster wie dealer_documents.category). Es STEUERT bewusst
--     NICHT die bestellbaren Größen — das gehört zur Ordereingabe, nicht hierher.
--   * collection   — freier Kollektionsname, bewusst GETRENNT von season_id
--     (Saison ist ein FK auf seasons, Kollektion ist freier Text).
--   * zuschlag     — €-Aufschlag je Artikel (Stammwert), numeric(10,2) wie die
--     übrigen Geldfelder, EUR. Wird in diesem Schritt NUR erfasst/angezeigt und
--     hängt in KEINER Preis-/Margenrechnung — die Rechenwirkung
--     (EK + Zuschlag → Selbstkosten?) ist erst nach Verena-Klärung ein eigener
--     Schritt. Bewusst NICHT zu verwechseln mit production_orders.transportkosten
--     (Ist-Fracht je Sendung, andere Ebene).
-- ============================================================================

alter table products
  add column if not exists size_scheme text,
  add column if not exists collection  text,
  add column if not exists zuschlag    numeric(10,2);
