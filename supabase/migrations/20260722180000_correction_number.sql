-- S7 Rechnungskorrektur — fortlaufende Korrektur-Nummer RK-YYYY-NNNN
--
-- Rechtlich „Rechnungskorrektur" (nicht „Gutschrift"): gleicher Prozess wie die
-- Rechnung, aber Minusbetrag. Der Beleg setzt auf die bestehende (rechnungs-
-- verankerte) Retoure auf — die vorgerüsteten Felder returns.credit_note_number
-- und returns.pdf_path werden dabei belegt. Diese Migration liefert nur die
-- lückenlose Nummer (Muster wie next_invoice_number, security definer). Der
-- Backstop-Unique-Index uq_returns_credit_note_number besteht bereits.
--
-- Rein additiv & idempotent (CREATE OR REPLACE FUNCTION). Keine Tabellenänderung.

create or replace function next_correction_number(p_org_id uuid)
returns text as $$
declare
  last_num integer;
  year_prefix text;
begin
  year_prefix := to_char(current_date, 'YYYY');
  select coalesce(max(
    cast(split_part(credit_note_number, '-', 3) as integer)
  ), 0) into last_num
  from returns
  where org_id = p_org_id
  and credit_note_number like 'RK-' || year_prefix || '-%';
  return 'RK-' || year_prefix || '-' || lpad((last_num + 1)::text, 4, '0');
end;
$$ language plpgsql security definer;
