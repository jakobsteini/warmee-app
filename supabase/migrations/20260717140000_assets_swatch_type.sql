-- ============================================================================
-- ASSET-TYP „Farbmuster" (swatch)
-- Baustein „Bildarchiv: Bild-Typ als primäre Achse" (2026-07-17).
--
-- Hintergrund: 36 der 94 Bilder sind Farbmuster (Dateiname „Code_Farbe",
-- beginnt mit einer Ziffer), keine Produktfotos. Sie gehören zu einer Farbe,
-- nicht zu einem Artikel. Bisher lagen sie mangels passendem Typ als
-- asset_type='product' ohne product_id da. Neuer Typwert 'swatch' macht sie
-- als eigene Bild-Art filter- und unterscheidbar.
--
-- Diese Migration MUSS ausgeführt werden (Supabase SQL Editor, Projekt
-- wyddahfnxiilootylcwg) — VOR dem Reklassifizierungs-UPDATE (das UPDATE auf
-- 'swatch' würde sonst am CHECK scheitern). Das UPDATE selbst ist reines
-- Daten-SQL und NICHT Teil dieser Datei (Jakob führt es nach Sichtung der
-- Ausreißer aus).
--
-- Zur „kein DROP"-Regel: Ein erlaubter Wert lässt sich in Postgres nur per
-- DROP+ADD des CHECK ergänzen (wie bei der Einkauf-Rolle). Das WEITET nur den
-- Wertebereich — keine bestehende assets-Zeile wird ungültig. drop-if-exists +
-- add ist bei erneutem Lauf idempotent. Sonst keine Änderung an Spalten/RLS.
-- ============================================================================

alter table assets
  drop constraint if exists assets_asset_type_check;

alter table assets
  add constraint assets_asset_type_check
  check (asset_type in ('product', 'lifestyle', 'campaign', 'lookbook', 'swatch'));
