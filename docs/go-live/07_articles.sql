-- ============================================================================
-- 07 · ARTIKEL-IMPORT SS27 (48 Artikel)
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (erneutes
-- Ausführen ist unschädlich). Erwartetes Ergebnis: 1 Saison SS27 + 48 Zeilen in products.
-- ============================================================================

-- Saison SS27 anlegen (falls noch nicht vorhanden).
insert into seasons (org_id, code, label, is_active)
select (select id from organizations), 'SS27', 'SS27', false
on conflict (org_id, code) do nothing;

insert into products (
  org_id, season_id, name, style, composition, gauge, ply, yarn_count, weight, note, purchase_price, wholesale_price, retail_price
) values
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Flap Me felted', 'Flap Me felted', '100% cashmere', '14gg', '1 ply', '42/2', null, null, 23.3, 57, 149),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Elder felted', 'Elder felted', '100% cashmere', '2.5gg', '9ply', '28/2', null, null, 29.5, 66, 169),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Elder felted twisted', 'Elder felted twisted', '100% cashmere', '2.5gg', '9ply', '28/2', null, null, 30.5, 66, 169),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Isa', 'Isa', '100% cashmere', null, null, null, null, null, 35.5, 75, 189),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Isa shaded', 'Isa shaded', '100% cashmere', null, null, null, '122gms', null, 37, 79, 199),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Mika felted', 'Mika felted', '100% cashmere', null, null, null, '75gms', null, 29, 66, 169),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Coco hatband', 'Coco hatband', '100% cashmere', null, null, null, '58gms', 'sample wilma', 25, 55, 139),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Nomad', 'Nomad', '100% cashmere', '8gg', '1', '28/1', null, '55fw', 57, 110, 289),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Nomad FD', 'Nomad FD', '100% cashmere', '7gg', '1ply', '28/1', null, null, 57, 115, 299),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Bibi very felted', 'Bibi very felted', '100% cashmere', null, null, null, null, 'aold nomad small', 57, 110, 289),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Bibi very felted FD', 'Bibi very felted FD', '100% cashmere', null, null, null, null, 'aold nomad small', 59, 115, 299),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Felix felted', 'Felix felted', '100% cashmere', '8gg', '1ply', '28/2', null, '30?', 28, 65, 169),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Felix felted leo', 'Felix felted leo', '100% cashmere', '8gg', '1ply', null, null, null, null, 68, 175),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Axis felted', 'Axis felted', '100% cashmere', '8gg', '1ply', '28/2', null, null, 36, 74, 189),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Axis felted sahed', 'Axis felted sahed', '100% cashmere', '8gg', '1ply', null, null, null, 38, 76, 195),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Märta', 'Märta', '100% cashmere', null, null, null, '78gms', null, 30, 65, 169),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Julie', 'Julie', '100% cashmere', null, null, null, '55gms', null, 28, 60, 159),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Wanda small bandana', 'Wanda small bandana', '100% cashmere', null, null, '200/2', '21gms', 'woven', 27, 55, 139),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Wanda XL bandana', 'Wanda XL bandana', '100% cashmere', null, null, '200/2', '68gms', 'woven', 33, 62, 159),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Hair Tie', 'Hair Tie', '100% cashmere', '8gg', '1', '28/2', null, null, 12.5, 22, 45),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Hair Tie leo', 'Hair Tie leo', '100% cashmere', '8gg', '1', '28/2', null, null, 13.52, 24, 48),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Hair tie shaded', 'Hair tie shaded', '100% cashmere', '8gg', '1', '28/2', null, null, 12.56, 24, 48),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Erik belte', 'Erik belte', '100% cashmere', '8gg', '1', '28/2', null, null, 19, 40, 79),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Erik pattern', 'Erik pattern', '100% cashmere', '8gg', '1ply', null, null, null, 26, 49, 99),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Vera', 'Vera', '100% cashmere', null, null, null, '67gms', null, 29, 55, 139),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Ebba', 'Ebba', '100% cashmere', null, null, null, '44gms', null, 30, 55, 139),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Soni', 'Soni', '100% cashmere', null, null, null, '121gms', null, 48, 89, 229),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Malin', 'Malin', '100% cashmere', null, null, null, '118gms', null, 46, 89, 229),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Ilaria', 'Ilaria', '100% cashmere', null, null, null, null, null, 74, 150, 389),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Vinja Cardigan', 'Vinja Cardigan', '100% cashmere', null, null, null, null, null, 76, 150, 389),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Alice', 'Alice', '100% cashmere', null, null, null, '215gms', null, 80, 145, 379),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Alice shaded', 'Alice shaded', '100% cashmere', null, null, null, '215gms', null, null, 149, 389),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Lou Top', 'Lou Top', '100% cashmere', null, null, null, '133gms', null, 50, 90, 229),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Adele', 'Adele', '100% cashmere', null, null, null, '423gms', null, 121, 210, 549),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Melina Cardigan handknit', 'Melina Cardigan handknit', '100% cashmere', null, null, null, null, null, null, null, null),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Celia Cardigan', 'Celia Cardigan', '100% cashmere', null, null, null, '586gms', null, 140, 250, 649),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Wilma', 'Wilma', '100% cashmere', null, null, null, '320gms', null, 96, 170, 439),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Alois west', 'Alois west', '100% cashmere', null, null, null, '285gms', null, 93, 165, 429),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Amelie Cardigan', 'Amelie Cardigan', '100% cashmere', null, null, null, '416gms', null, 124, 220, 569),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Odette', 'Odette', '100% cashmere', null, null, null, '290gms', null, 92, 160, 419),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Svea', 'Svea', '100% cashmere', null, null, null, '180gms', null, 75, 150, 389),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Lotti', 'Lotti', '100% cashmere', null, null, null, '212gms', null, 75, 150, 389),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Fleur', 'Fleur', '100% cashmere', null, null, null, '663gms', 'auch uni', 141, 250, 649),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Charly Bomber', 'Charly Bomber', '100% cashmere', null, null, null, '966gms', null, 215, 380, 950),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Emy Cardigan', 'Emy Cardigan', '100% cashmere', null, null, null, null, null, 118, 210, 549),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Emy cardigan shaded', 'Emy cardigan shaded', '100% cashmere', null, null, null, '379gms', null, 122, 214, 559),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Vicy', 'Vicy', '100% cashmere', null, null, null, '577gms', null, 139, 250, 649),
  ((select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'SS27'), 'Franzi shortsleeve', 'Franzi shortsleeve', '100% cashmere', '8gg', '2ply', null, '235gms', null, 74, 145, 379)
on conflict (org_id, season_id, style) do update set
  name = excluded.name,
  composition = excluded.composition,
  gauge = excluded.gauge,
  ply = excluded.ply,
  yarn_count = excluded.yarn_count,
  weight = excluded.weight,
  note = excluded.note,
  purchase_price = excluded.purchase_price,
  wholesale_price = excluded.wholesale_price,
  retail_price = excluded.retail_price;

-- VERIFIKATION (schlägt fehl, wenn die Zeilenzahl nicht EXAKT stimmt)
do $$
declare n int;
begin
  select (select count(*) from products where org_id = (select id from organizations) and season_id = (select id from seasons where org_id = (select id from organizations) and code = 'SS27')) into n;
  raise notice 'products_ss27: % (erwartet genau 48)', n;
  if n <> 48 then raise exception 'FEHLER products_ss27: % statt genau 48', n; end if;
end $$;
select (select count(*) from products where org_id = (select id from organizations) and season_id = (select id from seasons where org_id = (select id from organizations) and code = 'SS27')) as products_ss27;
