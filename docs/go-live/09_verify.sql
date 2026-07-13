-- ============================================================================
-- 09 · GESAMT-VERIFIKATION
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (erneutes
-- Ausführen ist unschädlich). Erwartetes Ergebnis: Soll (strikt): 1 org, 128 dealers, 48 products SS27, 1 producer, 1 order/104 items, RLS aktiv.
-- ============================================================================

-- STRIKTE GESAMT-PRÜFUNG: bricht ab, wenn IRGENDEINE Zahl nicht EXAKT stimmt.
do $$
declare n int;
begin
  select (select count(*) from organizations) into n;
  if n <> 1 then raise exception 'FEHLER organisationen: % statt genau 1', n; end if;
  select (select count(*) from dealers where org_id = (select id from organizations)) into n;
  if n <> 128 then raise exception 'FEHLER haendler: % statt genau 128', n; end if;
  select (select count(*) from products where org_id = (select id from organizations) and season_id = (select id from seasons where org_id = (select id from organizations) and code = 'SS27')) into n;
  if n <> 48 then raise exception 'FEHLER artikel_ss27: % statt genau 48', n; end if;
  select (select count(*) from producers where org_id = (select id from organizations) and name = 'Shangri-La') into n;
  if n <> 1 then raise exception 'FEHLER produzent_shangri_la: % statt genau 1', n; end if;
  select (select count(*) from production_orders where org_id = (select id from organizations) and notes = '3. Order FW26') into n;
  if n <> 1 then raise exception 'FEHLER produktionsbestellung_fw26: % statt genau 1', n; end if;
  select (select count(*) from production_order_items i join production_orders po on po.id = i.production_order_id where po.org_id = (select id from organizations) and po.notes = '3. Order FW26') into n;
  if n <> 104 then raise exception 'FEHLER nepal_positionen: % statt genau 104', n; end if;
  raise notice 'OK: alle Soll-Zahlen exakt getroffen.';
end $$;

-- Anzeige-Tabelle (ist / soll):
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
