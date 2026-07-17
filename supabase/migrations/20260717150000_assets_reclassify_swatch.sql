-- ============================================================================
-- Reklassifizierung bestehender Bilder auf asset_type = 'swatch'
-- Baustein „Bildarchiv: Bild-Typ als primäre Achse" (2026-07-17).
--
-- Regel (Kundenentscheidung): Ein Dateiname, der mit einer ZIFFER beginnt, ist
-- ein Farbmuster („Code_Farbe", z. B. „530_olivine"), kein Produktfoto. Solche
-- Bilder gehören zu einer Farbe, nicht zu einem Artikel, und wurden mangels
-- passendem Typ bisher als asset_type='product' ohne product_id geführt.
--
-- REIHENFOLGE (zwingend): Diese Datei läuft NACH
-- 20260717140000_assets_swatch_type.sql. Jene weitet den CHECK auf 'swatch';
-- ohne sie scheitert dieses UPDATE am assets_asset_type_check.
--
-- Diese Migration MUSS im Supabase SQL Editor (Projekt wyddahfnxiilootylcwg)
-- ausgeführt werden. Reines Daten-SQL, kein Schema-Eingriff.
--
-- Idempotenz: Das WHERE schließt bereits umklassifizierte Zeilen aus
-- (asset_type is distinct from 'swatch'); ein erneuter Lauf trifft nichts mehr.
-- Es werden ausschließlich Ziffer-Präfix-Bilder berührt — bereits einem Artikel
-- zugeordnete Produktfotos (Namen beginnen mit Buchstaben) bleiben unangetastet.
-- ============================================================================

update assets
   set asset_type = 'swatch'
 where filename ~ '^[0-9]'
   and asset_type is distinct from 'swatch';
