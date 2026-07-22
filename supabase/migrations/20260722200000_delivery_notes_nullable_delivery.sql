-- S9 FALL B — Lieferschein ohne Order (freier LS)
--
-- Bisher hing jeder Lieferschein an einer Lieferung (delivery_id NOT NULL). Für
-- den freien Beleg ohne Order trägt der LS seine Positionen selbst
-- (delivery_note_items, S2) und braucht keinen deliveries-Datensatz — analog zur
-- freien Rechnung (invoices.delivery_id ist bereits nullable).
--
-- Rein additiv: ALTER COLUMN DROP NOT NULL (no-op bei erneutem Lauf). Bestehende
-- Lieferscheine haben delivery_id gesetzt und bleiben unberührt.

alter table delivery_notes alter column delivery_id drop not null;
