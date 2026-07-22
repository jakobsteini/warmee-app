-- S3 Rechnung — Frachtkosten
--
-- Frachtkosten werden manuell bei der Rechnungserstellung erfasst und sind
-- STEUERWIRKSAM: sie werden dem Warennetto zugeschlagen und mit dem Steuersatz
-- DER RECHNUNG besteuert (Fracht folgt der Hauptleistung — auf einer
-- 0-%-Reverse-Charge-/Ausfuhr-Rechnung also ebenfalls 0 %). Der Betrag wird als
-- eigener Snapshot eingefroren (wie subtotal/tax_amount/total).
--
-- Rein additiv & idempotent. Bestehende Rechnungen erhalten 0 (Default) und
-- bleiben damit zahlengleich — kein Retro-Effekt, keine Frachtzeile auf der PDF.

alter table invoices
  add column if not exists frachtkosten numeric(10,2) not null default 0;
