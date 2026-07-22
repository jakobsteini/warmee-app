-- CRM — freie Kundennotiz je Händler
--
-- Ein einzelnes Freitext-Notizfeld je Händler (kein Historien-Log): freie
-- Vermerke, banal bis geschäftlich. Alle Systemnutzer dürfen es sehen und
-- bearbeiten (kein Rollenkonzept). Beim Speichern wird Zeitpunkt + Persona
-- mitgeschrieben (sichtbares Überschreiben, kein stiller Datenverlust).
--
-- Multi-Mandant: das Feld hängt an dealers (org_id + RLS bestehen), damit
-- automatisch pro Mandant (WARM ME / Room with a View) getrennt — nichts
-- Mandanten-Spezifisches nötig.
--
-- Rein additiv & idempotent (ADD COLUMN IF NOT EXISTS). Bestandshändler → NULL,
-- keine Fehler, keine bestehende Spalte verändert.

alter table dealers
  add column if not exists crm_notiz text,
  add column if not exists crm_notiz_updated_at timestamptz,
  add column if not exists crm_notiz_updated_by text;
