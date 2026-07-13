-- ============================================================================
-- 09 · GESAMT-VERIFIKATION
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (erneutes
-- Ausführen ist unschädlich). Erwartetes Ergebnis: Soll: 1 org, 128 dealers, 48 products SS27, 1 producer, 1 order/104 items, RLS aktiv.
-- ============================================================================

select 'organisationen' as pruefung, count(*) as ist, 1 as soll from organizations
union all select 'haendler (WARM ME)', count(*), 128 from dealers where org_id = (select id from organizations)
union all select 'artikel SS27', count(*), 48 from products where org_id = (select id from organizations) and season_id = (select id from seasons where org_id = (select id from organizations) and code = 'SS27')
union all select 'produzent Shangri-La', count(*), 1 from producers where org_id = (select id from organizations) and name = 'Shangri-La'
union all select 'produktionsbestellung FW26', count(*), 1 from production_orders where org_id = (select id from organizations) and notes = '3. Order FW26'
union all select 'nepal-positionen', count(*), 104 from production_order_items i
  join production_orders po on po.id = i.production_order_id
  where po.org_id = (select id from organizations) and po.notes = '3. Order FW26'
union all select 'RLS aktiv (erwartet true) — dealers', (rowsecurity)::int, 1 from pg_tables where tablename = 'dealers'
union all select 'RLS aktiv (erwartet true) — products', (rowsecurity)::int, 1 from pg_tables where tablename = 'products'
union all select 'RLS aktiv (erwartet true) — producers', (rowsecurity)::int, 1 from pg_tables where tablename = 'producers'
union all select 'RLS aktiv (erwartet true) — production_order_items', (rowsecurity)::int, 1 from pg_tables where tablename = 'production_order_items';
