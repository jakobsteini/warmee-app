-- S1 Belegsperre & Statusmodell (Lieferschein)
--
-- Der Lieferschein bekommt — wie die Rechnung — einen Beleg-Status
-- (Entwurf → Versendet → Storniert). „Versendet" (sent) ist der Sperr-Trigger:
-- ab dann ist der Beleg read-only, Korrektur nur über Storno + Neubeleg.
-- Zusätzlich wird ein Lieferschein quer gesperrt, sobald aus der zugehörigen
-- Lieferung eine Rechnung erzeugt UND versendet wurde (App-Logik in
-- setInvoiceStatus).
--
-- Der Lock selbst wird APP-SEITIG erzwungen (isDeliveryNoteLocked, analog
-- isSupplierOrderLocked bei den Produktionsbestellungen) — hier nur die
-- Statusfelder. Rein additiv & idempotent: nur ADD COLUMN IF NOT EXISTS, kein
-- DROP/RENAME/Typwechsel. Bestehende Zeilen erhalten durch das Default 'draft'
-- einen gültigen Wert (Zahlen/Beträge bleiben unberührt).
--
-- Die Rechnung hat ihren Status (draft/sent/paid/cancelled) bereits — dafür ist
-- KEINE Migration nötig; 'sent' wird als Sperr-Trigger genutzt.

alter table delivery_notes
  add column if not exists status text not null default 'draft',
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references profiles(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id),
  add column if not exists cancelled_reason text;

-- CHECK additiv nachrüsten (nur, falls noch nicht vorhanden), damit ein
-- erneutes Einspielen nicht scheitert.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_notes_status_check'
  ) then
    alter table delivery_notes
      add constraint delivery_notes_status_check
      check (status in ('draft', 'sent', 'cancelled'));
  end if;
end $$;
