-- S6a Kommissionsware — Liefertyp des Lieferscheins
--
-- Ein Lieferschein ist entweder ein Verkauf ('sale', Standard) oder eine
-- Kommissionslieferung ('kommission'). Ein Kommissions-LS bleibt bewusst im
-- Entwurf (Positionen reduzierbar), bis er fakturiert wird — erst mit der
-- Rechnung wird er gesperrt + archiviert (Cross-Doc-Sperre in setInvoiceStatus).
-- Der Flag ändert die Sperr-Logik NICHT, er markiert nur die Absicht.
--
-- Rein additiv & idempotent. Bestehende Lieferscheine erhalten 'sale' (Default)
-- und bleiben unberührt.

alter table delivery_notes
  add column if not exists delivery_type text not null default 'sale';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_notes_delivery_type_check'
  ) then
    alter table delivery_notes
      add constraint delivery_notes_delivery_type_check
      check (delivery_type in ('sale', 'kommission'));
  end if;
end $$;
