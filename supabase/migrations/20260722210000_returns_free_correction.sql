-- S7b Freie Rechnungskorrektur OHNE Bezug
--
-- Verena: Rechnungskorrektur „mit UND ohne Bezug". Die verankerte Variante (aus
-- einer Retoure) besteht (S7). Für die FREIE Korrektur braucht eine returns-Zeile
-- KEINEN Anker (weder Rechnung noch Lieferschein). Der bisherige XOR-Check
-- (genau ein Anker) wird deshalb auf „HÖCHSTENS ein Anker" gelockert — bestehende
-- verankerte Retouren erfüllen den lockeren Check weiterhin.
--
-- Zusätzlich bekommen return_items eine optionale `description` (Freitext), damit
-- die manuell erfassten Positionen einer freien Korrektur eine Bezeichnung tragen
-- (verankerte Retouren beziehen die Bezeichnung wie bisher aus der Quellzeile).
--
-- Rein additiv & idempotent: DROP CONSTRAINT IF EXISTS + neuer Check per Guard,
-- ADD COLUMN IF NOT EXISTS. Kein Spalten-/Tabellen-DROP, kein Typwechsel.

alter table returns drop constraint if exists returns_anchor_xor;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'returns_anchor_atmostone'
  ) then
    alter table returns add constraint returns_anchor_atmostone
      check (not (invoice_id is not null and delivery_note_id is not null));
  end if;
end $$;

alter table return_items
  add column if not exists description text;
