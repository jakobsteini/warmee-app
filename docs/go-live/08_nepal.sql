-- ============================================================================
-- 08 · NEPAL-PRODUKTIONSBESTELLUNG FW26 (Shangri-La, 104 Positionen)
-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (erneutes
-- Ausführen ist unschädlich). Erwartetes Ergebnis: 1 producer + 1 season FW26 + 1 production_order + 104 items.
-- ============================================================================

-- Produzent Shangri-La (Nepal) anlegen, falls noch nicht vorhanden.
insert into producers (org_id, name, country, active)
select (select id from organizations), 'Shangri-La', 'NP', true
where not exists (select 1 from producers where org_id = (select id from organizations) and name = 'Shangri-La');

-- Saison FW26 anlegen, falls noch nicht vorhanden (NICHT SS27).
insert into seasons (org_id, code, label, is_active)
select (select id from organizations), 'FW26', 'FW26', false
on conflict (org_id, code) do nothing;

-- Bestell-Header anlegen, falls noch nicht vorhanden (Schlüssel: org+season+producer+notes).
insert into production_orders (org_id, season_id, producer_id, status, notes)
select (select id from organizations), (select id from seasons where org_id = (select id from organizations) and code = 'FW26'), (select id from producers where org_id = (select id from organizations) and name = 'Shangri-La'), 'draft', '3. Order FW26'
where not exists (
  select 1 from production_orders po where po.org_id = (select id from organizations) and po.season_id = (select id from seasons where org_id = (select id from organizations) and code = 'FW26') and po.producer_id = (select id from producers where org_id = (select id from organizations) and name = 'Shangri-La') and po.notes = '3. Order FW26'
);

-- Positionen einfügen — nur wenn der Header noch keine hat (Idempotenz).
-- product_id NUR bei exaktem products.style-Treffer, sonst NULL (keine Phantom-Artikel).
insert into production_order_items (
  production_order_id, product_id, modell, modell_description, quality,
  color, color_description, group_name, price_per_piece, total_quantity, whole_price
)
select po.id,
  (select pr.id from products pr
     where pr.org_id = (select id from organizations)
       and lower(btrim(pr.style)) = lower(btrim(v.modell_description)) limit 1),
  v.modell, v.modell_description, v.quality, v.color, v.color_description,
  v.group_name, v.price_per_piece, v.total_quantity, v.whole_price
from production_orders po
cross join (values
    ('Elder', 'Elder felted', '100%WS', '16black', '16 black / 19-3909 TCX', 'Beanie Cas', 29.5, 2, 59),
    ('Elder', 'Elder felted', '100%WS', '21greyflan', '21 grey flanell / 19-3907 TCX', 'Beanie Cas', 29.5, 1, 29.5),
    ('Elder', 'Elder felted', '100%WS', '512chocola', '512 chocolate malt / 18-1324 TCX', 'Beanie Cas', 29.5, 2, 59),
    ('Elder', 'Elder felted', '100%WS', '515snowwht', '515 snow white / 11-0602 TCX', 'Beanie Cas', 29.5, 2, 59),
    ('Elder', 'Elder felted', '100%WS', '519marsred', '519 mars red / 18-1655 TCX', 'Beanie Cas', 29.5, 2, 59),
    ('Emmi', 'Emmi', '100%WS', '513white', '513 white alyssum / 11-1001 TCX  not yellowish', 'Beanie Cas', 31, 1, 31),
    ('FlapMe', 'Flap Me', '100%WS', '284mediter', '284 mediterrana / 19-4517 TCX older color', 'Beanie Cas', 23.3, 2, 46.6),
    ('FlapMe', 'Flap Me', '100%WS', '495tapestr', '495 tapestry / 18-4417 TCX', 'Beanie Cas', 23.3, 2, 46.6),
    ('FlapMe', 'Flap Me', '100%WS', '501rasperr', '501 rasperry radiance / 19-2432 TCX', 'Beanie Cas', 23.3, 3, 69.9),
    ('FlapMe', 'Flap Me', '100%WS', '502maroon', '502 maroon banner / 19-1529 TCX', 'Beanie Cas', 23.3, 4, 93.2),
    ('FlapMe', 'Flap Me', '100%WS', '504fruitdo', '504 fruit dove / 17-1926 TCX', 'Beanie Cas', 23.3, 4, 93.2),
    ('FlapMe', 'Flap Me', '100%WS', '505avocado', '505 avocado / 18-0430 TCX', 'Beanie Cas', 23.3, 3, 69.9),
    ('FlapMe', 'Flap Me', '100%WS', '506douglas', '506 douglas fire / 19-0220 TCX', 'Beanie Cas', 23.3, 4, 93.2),
    ('FlapMe', 'Flap Me', '100%WS', '519marsred', '519 mars red / 18-1655 TCX', 'Beanie Cas', 23.3, 4, 93.2),
    ('Heidi', 'Heidi', '100%WS', '517citadel', '517 citadel / 17-4111 TCX', 'Beanie Cas', 30.5, 1, 30.5),
    ('Ide', 'Ide', '100%WS', '14darkgrey', '14 dark grey melange / 25023', 'Beanie Cas', 37, 2, 74),
    ('Ide', 'Ide', '100%WS', '417chocola', '417 chocolate / 19-1110 TCX', 'Beanie Cas', 37, 2, 74),
    ('Oslo', 'Oslo', '100%WS', '40stardust', '40 stardust / 11-0603 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('Oslo', 'Oslo', '100%WS', '455latte', '455 Latte / 15-1220 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('Oslo', 'Oslo', '100%WS', '473peach', '473 peach whip / 14-1309 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('Oslo', 'Oslo', '100%WS', '494plein a', '494 plein air / 13-4111 TCX', 'Beanie Cas', 26.21, 2, 52.42),
    ('Oslo', 'Oslo', '100%WS', '495tapestr', '495 tapestry / 18-4417 TCX', 'Beanie Cas', 26.21, 2, 52.42),
    ('Oslo', 'Oslo', '100%WS', '503lotus', '503 lotus / 14-1905 TCX', 'Beanie Cas', 26.21, 2, 52.42),
    ('Oslo', 'Oslo', '100%WS', '504fruitdo', '504 fruit dove / 17-1926 TCX', 'Beanie Cas', 26.21, 2, 52.42),
    ('Oslo', 'Oslo', '100%WS', '506douglas', '506 douglas fire / 19-0220 TCX', 'Beanie Cas', 26.21, 2, 52.42),
    ('Oslo', 'Oslo', '100%WS', '520toast', '520 toast / 16-1331 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('Simplex', 'Simplex', '100%WS', '502maroon', '502 maroon banner / 19-1529 TCX', 'Beanie Cas', 26.21, 2, 52.42),
    ('AreMittens', 'Are Mittens', '100%WS', '14darkgrey', '14 dark grey melange / 25023', 'Mittens', 28, 2, 56),
    ('AreMittens', 'Are Mittens', '100%WS', '16black', '16 black / 19-3909 TCX', 'Mittens', 28, 4, 112),
    ('AreMittens', 'Are Mittens', '100%WS', '417chocola', '417 chocolate / 19-1110 TCX', 'Mittens', 28, 2, 56),
    ('AreMittens', 'Are Mittens', '100%WS', '494plein a', '494 plein air / 13-4111 TCX', 'Mittens', 28, 2, 56),
    ('AreMittens', 'Are Mittens', '100%WS', '503lotus', '503 lotus / 14-1905 TCX', 'Mittens', 28, 2, 56),
    ('AreMittens', 'Are Mittens', '100%WS', '512chocola', '512 chocolate malt / 18-1324 TCX', 'Mittens', 28, 2, 56),
    ('AreMittens', 'Are Mittens', '100%WS', '515snowwht', '515 snow white / 11-0602 TCX', 'Mittens', 28, 2, 56),
    ('AreMittens', 'Are Mittens', '100%WS', '519marsred', '519 mars red / 18-1655 TCX', 'Mittens', 28, 2, 56),
    ('Aimeefelt', 'Aimee felted', '100%WS', '501rasperr', '501 rasperry radiance / 19-2432 TCX', 'Scarves Ca', 41, 3, 123),
    ('Aimeefelt', 'Aimee felted', '100%WS', '506douglas', '506 douglas fire / 19-0220 TCX', 'Scarves Ca', 41, 3, 123),
    ('Ela', 'Ela', '100%WS', '476sierra', '476 sierra / 18-1239 TCX', 'Scarves Ca', 82, 1, 82),
    ('Ela', 'Ela', '100%WS', '505avocado', '505 avocado / 18-0430 TCX', 'Scarves Ca', 82, 3, 246),
    ('Ela', 'Ela', '100%WS', '512chocola', '512 chocolate malt / 18-1324 TCX', 'Scarves Ca', 82, 1, 82),
    ('Ela', 'Ela', '100%WS', '513white', '513 white alyssum / 11-1001 TCX  not yellowish', 'Scarves Ca', 82, 1, 82),
    ('FelixBanda', 'Felix Bandana', '100%WS', '513/512', '513 white alyssum / 512 chocolate malt', 'Scarves Ca', 29.23, 2, 58.46),
    ('FelixBanda', 'Felix Bandana', '100%WS', '518/516', '518 dark full grey / 516 anthracite', 'Scarves Ca', 29.23, 2, 58.46),
    ('FrancDoubs', 'Francois double shade', '100%WS', '460/473', 'Var3: 460 nimbus cloud/ 473 peach whip', 'Scarves Ca', 50.23, 4, 200.92),
    ('Francoise', 'Francoise', '100%WS', '40stardust', '40 stardust / 11-0603TCX', 'Scarves Ca', 48, 1, 48),
    ('Francoise', 'Francoise', '100%WS', '508tea', '508 tea / 16-0213 TCX', 'Scarves Ca', 48, 1, 48),
    ('Francoise', 'Francoise', '100%WS', '517citadel', '517 citadel / 17-4111 TCX', 'Scarves Ca', 48, 3, 144),
    ('Francoise', 'Francoise', '100%WS', '520toast', '520 toast / 16-1331 TCX', 'Scarves Ca', 48, 1, 48),
    ('Nomad', 'Nomad', '100%WS', '519marsred', '519 mars red / 18-1655 TCX', 'Scarves Ca', 55, 1, 55),
    ('Nomadsm', 'Nomad small', '100%WS', '21greyflan', '21 grey flanell / 19-3907 TCX', 'Scarves Ca', 38, 1, 38),
    ('Nomadsm', 'Nomad small', '100%WS', '40stardust', '40 stardust / 11-0603 TCX', 'Scarves Ca', 38, 1, 38),
    ('Nomadsm', 'Nomad small', '100%WS', '462adobe', '462 adobe rose / 16-1508 TCX', 'Scarves Ca', 38, 1, 38),
    ('Nomadsm', 'Nomad small', '100%WS', '475mocca m', '475 mocca mousse / 17-1230 TCX', 'Scarves Ca', 38, 1, 38),
    ('Nomadsm', 'Nomad small', '100%WS', '504fruitdo', '504 fruit dove / 17-1926 TCX', 'Scarves Ca', 38, 2, 76),
    ('Nomadsm', 'Nomad small', '100%WS', '505avocado', '505 avocado / 18-0430 TCX', 'Scarves Ca', 38, 2, 76),
    ('Nomadsm', 'Nomad small', '100%WS', '508tea', '508 tea / 16-0213 TCX', 'Scarves Ca', 38, 1, 38),
    ('Nomadsm', 'Nomad small', '100%WS', '513white', '513 white alyssum / 11-1001 TCX  not yellowish', 'Scarves Ca', 38, 1, 38),
    ('Nomadsm', 'Nomad small', '100%WS', '520toast', '520 toast / 16-1331 TCX', 'Scarves Ca', 38, 1, 38),
    ('DaDreamCRS', 'Damian DREAM CR silver', '100%WS', '16black', '16 black / 19-3909 TCX', 'Beanie Cas', 23.51, 2, 47.02),
    ('DaDreamCRS', 'Damian DREAM CR silver', '100%WS', '515snowwht', '515 snow white / 11-0602 TCX', 'Beanie Cas', 23.51, 2, 47.02),
    ('DaLoveCRS', 'Damian LOVE CR silver', '100%WS', '13lightgre', '13 light grey melange / 25251', 'Beanie Cas', 23.51, 2, 47.02),
    ('DaStripeRo', 'Damian Stripe rosa', '100%WS', '512chocola', '512 chocolate malt / 18-1324 TCX', 'Beanie Cas', 23.51, 2, 47.02),
    ('DaStripeSi', 'Damian Stripe silver', '100%WS', '16black', '16 black / 19-3909 TCX', 'Beanie Cas', 23.51, 3, 70.53),
    ('DaStripeSi', 'Damian Stripe silver', '100%WS', '454desertt', '454 desert taupe / 17-1311 TCX', 'Beanie Cas', 23.51, 2, 47.02),
    ('OsDreamCFS', 'Oslo Dream CF silver', '100%WS', '40stardust', '40 stardust / 11-0603 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('OsLoBloCFS', 'Oslo Love Block CF silver', '100%WS', '40stardust', '40 stardust / 11-0603 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('OsloSmiley', 'Oslo Smiley CR', '100%WS', '40stardust', '40 stardust / 11-0603 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('OsloSmiley', 'Oslo Smiley CR', '100%WS', '508tea', '508 tea / 16-0213 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('OsLoThCRSi', 'Oslo Love thin CR silver', '100%WS', '505avocado', '505 avocado / 18-0430 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('OsSmilCFSi', 'Oslo SMILE CF silver', '100%WS', '503lotus', '503 lotus / 14-1905 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('OsSmilCFSi', 'Oslo SMILE CF silver', '100%WS', '519marsred', '519 mars red / 18-1655 TCX', 'Beanie Cas', 26.21, 1, 26.21),
    ('Camille', 'Camille', '100%WS', '228darknav', '228 dark navy / 25030 consinee', 'Tops', 91, 3, 273),
    ('Camille', 'Camille', '100%WS', '427bluehor', '427 blue horizon / 18-3929 TCX', 'Tops', 91, 1, 91),
    ('Camille', 'Camille', '100%WS', '517citadel', '517 citadel / 17-4111 TCX', 'Tops', 91, 2, 182),
    ('CamilleHoo', 'Camille Hoodie', '100%WS', '503lotus', '503 lotus / 14-1905 TCX', 'Tops', 110, 1, 110),
    ('CamilleHoo', 'Camille Hoodie', '100%WS', '513white', '513 white alyssum / 11-1001 TCX  not yellowish', 'Tops', 110, 1, 110),
    ('CamilleHoo', 'Camille Hoodie', '100%WS', '517citadel', '517 citadel / 17-4111 TCX', 'Tops', 110, 1, 110),
    ('Kristof', 'Kristof', '100%WS', '284mediter', '284 mediterrana / 19-4517 TCX', 'Tops', 77, 1, 77),
    ('Kristof', 'Kristof', '100%WS', '502maroon', '502 maroon banner / 19-1529 TCX', 'Tops', 77, 2, 154),
    ('Kristof', 'Kristof', '100%WS', '506douglas', '506 douglas fire / 19-0220 TCX', 'Tops', 77, 1, 77),
    ('Leni', 'Leni', '100%WS', '516anthrac', '516 anthracite / 19-4007 TCX', 'Tops', 105, 4, 420),
    ('Louise', 'Louise', '100%WS', '516anthrac', '516 anthracite / 19-4007 TCX', 'Tops', 97, 1, 97),
    ('Mala', 'Mala', '100%WS', '16black', '16 black / 19-3909 TCX', 'Tops', 102, 1, 102),
    ('Mala', 'Mala', '100%WS', '40stardust', '40 stardust / 11-0603 TCX', 'Tops', 102, 1, 102),
    ('Mala', 'Mala', '100%WS', '503lotus', '503 lotus / 14-1905 TCX', 'Tops', 102, 1, 102),
    ('Mala', 'Mala', '100%WS', '504fruitdo', '504 fruit dove / 17-1926 TCX', 'Tops', 102, 2, 204),
    ('Mala', 'Mala', '100%WS', '513white', '513 white alyssum / 11-1001 TCX  not yellowish', 'Tops', 102, 1, 102),
    ('Mala', 'Mala', '100%WS', '517citadel', '517 citadel / 17-4111 TCX', 'Tops', 102, 3, 306),
    ('MilaDress', 'Mila Dress', '100%WS', '228darknav', '228 dark navy / 25030 consinee', 'Tops', 1, 1, 1),
    ('MilaDress', 'Mila Dress', '100%WS', '510frenchr', '510 french roast / 19-1012 TCX', 'Tops', 1, 1, 1),
    ('MilaDress', 'Mila Dress', '100%WS', '520toast', '520 toast / 16-1331 TCX', 'Tops', 1, 1, 1),
    ('Sui', 'Sui felted', '100%WS', '415honeysu', '415 honeysuckle / 18-2120 TCX', 'Tops', 78, 1, 78),
    ('Sui', 'Sui felted', '100%WS', '476sierra', '476 sierra / 18-1239 TCX', 'Tops', 78, 1, 78),
    ('Sui', 'Sui felted', '100%WS', '520toast', '520 toast / 16-1331 TCX', 'Tops', 78, 2, 156),
    ('TheShirt', 'The Shirt', '100%WS', '510frenchr', '510 french roast / 19-1012 TCX', 'Tops', 83, 3, 249),
    ('TheShirt', 'The Shirt', '100%WS', '516anthrac', '516 anthracite / 19-4007 TCX', 'Tops', 83, 3, 249),
    ('WinnyCarTW', 'Winny Cardigan Twisted', '100%WS', '516/518', '516 anthracite/ 518 dark full grey', 'Tops', 133.5, 3, 400.5),
    ('Yasemin', 'Yasemin Cardigan', '100%WS', '496carbon', '496 carbon / 19-4012 TCX', 'Tops', 1, 1, 1),
    ('Yuki', 'Yuki felted', '100%WS', '13lightgre', '13 light grey melange / 25251', 'Tops', 110, 3, 330),
    ('Yuki', 'Yuki felted', '100%WS', '505avocado', '505 avocado / 18-0430 TCX', 'Tops', 110, 1, 110),
    ('Yuki', 'Yuki felted', '100%WS', '513white', '513 white alyssum / 11-1001 TCX  not yellowish', 'Tops', 110, 2, 220),
    ('Yuki', 'Yuki felted', '100%WS', '517citadel', '517 citadel / 17-4111 TCX', 'Tops', 110, 1, 110),
    ('YukiStripe', 'Yuki Stripe felted', '100%WS', '284/496/49', '284 mediterrana/ 496 carbon/ 495 tapestry', 'Tops', 113, 3, 339),
    ('Yume', 'Yume', '100%WS', '510frenchr', '510 french roast / 19-1012 TCX', 'Tops', 96.8, 3, 290.4)
) as v(modell, modell_description, quality, color, color_description, group_name, price_per_piece, total_quantity, whole_price)
where po.org_id = (select id from organizations) and po.season_id = (select id from seasons where org_id = (select id from organizations) and code = 'FW26') and po.producer_id = (select id from producers where org_id = (select id from organizations) and name = 'Shangri-La') and po.notes = '3. Order FW26'
  and not exists (select 1 from production_order_items i where i.production_order_id = po.id);

-- VERIFIKATION (schlägt fehl, wenn zu wenige Zeilen)
do $$
declare n int;
begin
  select (select count(*) from production_order_items i join production_orders po on po.id = i.production_order_id where po.org_id = (select id from organizations) and po.season_id = (select id from seasons where org_id = (select id from organizations) and code = 'FW26') and po.producer_id = (select id from producers where org_id = (select id from organizations) and name = 'Shangri-La') and po.notes = '3. Order FW26') into n;
  raise notice 'nepal_items: % (erwartet >= 104)', n;
  if n < 104 then raise exception 'FEHLER nepal_items: nur % statt 104', n; end if;
end $$;
select (select count(*) from production_order_items i join production_orders po on po.id = i.production_order_id where po.org_id = (select id from organizations) and po.season_id = (select id from seasons where org_id = (select id from organizations) and code = 'FW26') and po.producer_id = (select id from producers where org_id = (select id from organizations) and name = 'Shangri-La') and po.notes = '3. Order FW26') as nepal_items;
