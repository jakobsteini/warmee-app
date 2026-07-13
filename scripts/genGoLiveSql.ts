/**
 * Generator: schreibt die Go-Live-SQL-Blöcke aus den VERIFIZIERTEN Dry-Run-Daten.
 *
 * Rein lokal, KEIN DB-Zugriff. Nutzt exakt dieselben Loader wie die drei
 * Import-Skripte (loadDealerRecords/loadArticleRecords/loadPositions) und
 * schreibt fertige INSERT-…-ON-CONFLICT-Blöcke nach docs/go-live/.
 *
 *   node scripts/genGoLiveSql.ts
 *
 * Erzeugt: 06_dealers.sql, 07_articles.sql, 08_nepal.sql, 09_verify.sql.
 * Bricht ab, wenn die Zeilenzahlen nicht 128 / 48 / 104 sind.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { loadDealerRecords, type DealerRecord } from './importDealers.ts'
import { loadArticleRecords, type ProductRecord } from './importArticles.ts'
import { loadPositions, type PositionRecord } from './importProductionOrder.ts'

const OUT = new URL('../docs/go-live/', import.meta.url).pathname
/** org_id-Referenz: der einzige Mandant (WARM ME). Siehe 01_organization.sql. */
const ORG = '(select id from organizations)'

// ─── SQL-Wert-Helfer ─────────────────────────────────────────────────────────
function q(v: string | null): string {
  return v === null ? 'null' : `'${v.replace(/'/g, "''")}'`
}
function int(v: number | string | null): string {
  if (v === null || v === '') return 'null'
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? String(Math.trunc(n)) : 'null'
}
function money(v: number | string | null): string {
  if (v === null || v === '') return 'null'
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : 'null'
}
/** "col = excluded.col, …" für alle Spalten außer den Konflikt-Schlüssel. */
function updateSet(cols: string[], keys: string[]): string {
  return cols
    .filter((c) => !keys.includes(c))
    .map((c) => `  ${c} = excluded.${c}`)
    .join(',\n')
}

const banner = (title: string, expect: string) =>
  `-- ============================================================================\n` +
  `-- ${title}\n` +
  `-- Ein Copy-Paste-Block für den Supabase SQL Editor. Idempotent (erneutes\n` +
  `-- Ausführen ist unschädlich). Erwartetes Ergebnis: ${expect}\n` +
  `-- ============================================================================\n`

// Verifikations-Block, der bei falscher Zeilenzahl SICHTBAR fehlschlägt.
const verify = (label: string, sqlCount: string, expect: number) =>
  `\n-- VERIFIKATION (schlägt fehl, wenn zu wenige Zeilen)\n` +
  `do $$\ndeclare n int;\nbegin\n` +
  `  select ${sqlCount} into n;\n` +
  `  raise notice '${label}: % (erwartet >= ${expect})', n;\n` +
  `  if n < ${expect} then raise exception 'FEHLER ${label}: nur % statt ${expect}', n; end if;\n` +
  `end $$;\n` +
  `select ${sqlCount} as ${label};\n`

// ─── 06 · Händler ────────────────────────────────────────────────────────────
function genDealers(recs: DealerRecord[]): string {
  const cols = [
    'org_id', 'kundennummer', 'name', 'short_name', 'company_name', 'owner_name',
    'contact_name', 'uid', 'gegenkonto', 'email', 'city', 'country',
    'payment_terms_raw', 'skonto_prozent', 'skonto_tage', 'zahlungsziel_tage',
    'shipping_street', 'shipping_zip', 'shipping_city', 'shipping_country_code',
    'shipping_country_name', 'shipping_phone', 'shipping_email', 'shipping_email2',
    'billing_name', 'billing_street', 'billing_zip', 'billing_city',
    'billing_country_code', 'billing_country_name', 'billing_phone', 'billing_email',
    'store_name', 'store_street', 'store_zip', 'store_city', 'store_country_code',
    'store_country_name', 'store_phone', 'store_email',
  ]
  const row = (d: DealerRecord) =>
    '  (' + [
      ORG, int(d.kundennummer), q(d.name), q(d.short_name), q(d.company_name),
      q(d.owner_name), q(d.contact_name), q(d.uid), int(d.gegenkonto), q(d.email),
      q(d.city), q(d.country), q(d.payment_terms_raw), money(d.skonto_prozent),
      int(d.skonto_tage), int(d.zahlungsziel_tage), q(d.shipping_street),
      q(d.shipping_zip), q(d.shipping_city), q(d.shipping_country_code),
      q(d.shipping_country_name), q(d.shipping_phone), q(d.shipping_email),
      q(d.shipping_email2), q(d.billing_name), q(d.billing_street), q(d.billing_zip),
      q(d.billing_city), q(d.billing_country_code), q(d.billing_country_name),
      q(d.billing_phone), q(d.billing_email), q(d.store_name), q(d.store_street),
      q(d.store_zip), q(d.store_city), q(d.store_country_code),
      q(d.store_country_name), q(d.store_phone), q(d.store_email),
    ].join(', ') + ')'
  return (
    banner('06 · HÄNDLER-IMPORT (128 Händler)', '128 Zeilen in dealers (WARM ME).') +
    `\ninsert into dealers (\n  ${cols.join(', ')}\n) values\n` +
    recs.map(row).join(',\n') +
    `\non conflict (org_id, kundennummer) do update set\n` +
    updateSet(cols, ['org_id', 'kundennummer']) +
    ';\n' +
    verify('dealers_warmme', `(select count(*) from dealers where org_id = ${ORG})`, 128)
  )
}

// ─── 07 · Artikel SS27 ───────────────────────────────────────────────────────
function genArticles(recs: ProductRecord[]): string {
  const seasonId = `(select id from seasons where org_id = ${ORG} and code = 'SS27')`
  const cols = [
    'org_id', 'season_id', 'name', 'style', 'composition', 'gauge', 'ply',
    'yarn_count', 'weight', 'note', 'purchase_price', 'wholesale_price', 'retail_price',
  ]
  const row = (p: ProductRecord) =>
    '  (' + [
      ORG, seasonId, q(p.name), q(p.style), q(p.composition), q(p.gauge), q(p.ply),
      q(p.yarn_count), q(p.weight), q(p.note), money(p.purchase_price),
      money(p.wholesale_price), money(p.retail_price),
    ].join(', ') + ')'
  return (
    banner('07 · ARTIKEL-IMPORT SS27 (48 Artikel)', '1 Saison SS27 + 48 Zeilen in products.') +
    `\n-- Saison SS27 anlegen (falls noch nicht vorhanden).\n` +
    `insert into seasons (org_id, code, label, is_active)\n` +
    `select ${ORG}, 'SS27', 'SS27', false\n` +
    `on conflict (org_id, code) do nothing;\n\n` +
    `insert into products (\n  ${cols.join(', ')}\n) values\n` +
    recs.map(row).join(',\n') +
    `\non conflict (org_id, season_id, style) do update set\n` +
    updateSet(cols, ['org_id', 'season_id', 'style']) +
    ';\n' +
    verify(
      'products_ss27',
      `(select count(*) from products where org_id = ${ORG} and season_id = ${seasonId})`,
      48,
    )
  )
}

// ─── 08 · Nepal-Produktionsbestellung ────────────────────────────────────────
function genNepal(pos: PositionRecord[]): string {
  const seasonId = `(select id from seasons where org_id = ${ORG} and code = 'FW26')`
  const producerId = `(select id from producers where org_id = ${ORG} and name = 'Shangri-La')`
  const headerWhere =
    `po.org_id = ${ORG} and po.season_id = ${seasonId} ` +
    `and po.producer_id = ${producerId} and po.notes = '3. Order FW26'`
  const row = (p: PositionRecord) =>
    '    (' + [
      q(p.modell), q(p.modell_description), q(p.quality), q(p.color),
      q(p.color_description), q(p.group), money(p.price_per_piece),
      int(p.quantity), money(p.whole_price),
    ].join(', ') + ')'
  return (
    banner(
      '08 · NEPAL-PRODUKTIONSBESTELLUNG FW26 (Shangri-La, 104 Positionen)',
      '1 producer + 1 season FW26 + 1 production_order + 104 items.',
    ) +
    `\n-- Produzent Shangri-La (Nepal) anlegen, falls noch nicht vorhanden.\n` +
    `insert into producers (org_id, name, country, active)\n` +
    `select ${ORG}, 'Shangri-La', 'NP', true\n` +
    `where not exists (select 1 from producers where org_id = ${ORG} and name = 'Shangri-La');\n\n` +
    `-- Saison FW26 anlegen, falls noch nicht vorhanden (NICHT SS27).\n` +
    `insert into seasons (org_id, code, label, is_active)\n` +
    `select ${ORG}, 'FW26', 'FW26', false\n` +
    `on conflict (org_id, code) do nothing;\n\n` +
    `-- Bestell-Header anlegen, falls noch nicht vorhanden (Schlüssel: org+season+producer+notes).\n` +
    `insert into production_orders (org_id, season_id, producer_id, status, notes)\n` +
    `select ${ORG}, ${seasonId}, ${producerId}, 'draft', '3. Order FW26'\n` +
    `where not exists (\n  select 1 from production_orders po where ${headerWhere}\n);\n\n` +
    `-- Positionen einfügen — nur wenn der Header noch keine hat (Idempotenz).\n` +
    `-- product_id NUR bei exaktem products.style-Treffer, sonst NULL (keine Phantom-Artikel).\n` +
    `insert into production_order_items (\n` +
    `  production_order_id, product_id, modell, modell_description, quality,\n` +
    `  color, color_description, group_name, price_per_piece, total_quantity, whole_price\n` +
    `)\nselect po.id,\n` +
    `  (select pr.id from products pr\n` +
    `     where pr.org_id = ${ORG}\n` +
    `       and lower(btrim(pr.style)) = lower(btrim(v.modell_description)) limit 1),\n` +
    `  v.modell, v.modell_description, v.quality, v.color, v.color_description,\n` +
    `  v.group_name, v.price_per_piece, v.total_quantity, v.whole_price\n` +
    `from production_orders po\n` +
    `cross join (values\n` +
    pos.map(row).join(',\n') +
    `\n) as v(modell, modell_description, quality, color, color_description, group_name, price_per_piece, total_quantity, whole_price)\n` +
    `where ${headerWhere}\n` +
    `  and not exists (select 1 from production_order_items i where i.production_order_id = po.id);\n` +
    verify(
      'nepal_items',
      `(select count(*) from production_order_items i join production_orders po on po.id = i.production_order_id where ${headerWhere})`,
      104,
    )
  )
}

// ─── 09 · Gesamt-Verifikation ────────────────────────────────────────────────
function genVerify(): string {
  const s27 = `(select id from seasons where org_id = ${ORG} and code = 'SS27')`
  return (
    banner('09 · GESAMT-VERIFIKATION', 'Soll: 1 org, 128 dealers, 48 products SS27, 1 producer, 1 order/104 items, RLS aktiv.') +
    `\nselect 'organisationen' as pruefung, count(*) as ist, 1 as soll from organizations\n` +
    `union all select 'haendler (WARM ME)', count(*), 128 from dealers where org_id = ${ORG}\n` +
    `union all select 'artikel SS27', count(*), 48 from products where org_id = ${ORG} and season_id = ${s27}\n` +
    `union all select 'produzent Shangri-La', count(*), 1 from producers where org_id = ${ORG} and name = 'Shangri-La'\n` +
    `union all select 'produktionsbestellung FW26', count(*), 1 from production_orders where org_id = ${ORG} and notes = '3. Order FW26'\n` +
    `union all select 'nepal-positionen', count(*), 104 from production_order_items i\n` +
    `  join production_orders po on po.id = i.production_order_id\n` +
    `  where po.org_id = ${ORG} and po.notes = '3. Order FW26'\n` +
    `union all select 'RLS aktiv (erwartet true) — dealers', (rowsecurity)::int, 1 from pg_tables where tablename = 'dealers'\n` +
    `union all select 'RLS aktiv (erwartet true) — products', (rowsecurity)::int, 1 from pg_tables where tablename = 'products'\n` +
    `union all select 'RLS aktiv (erwartet true) — producers', (rowsecurity)::int, 1 from pg_tables where tablename = 'producers'\n` +
    `union all select 'RLS aktiv (erwartet true) — production_order_items', (rowsecurity)::int, 1 from pg_tables where tablename = 'production_order_items';\n`
  )
}

// ─── Ausführung ──────────────────────────────────────────────────────────────
const dealers = loadDealerRecords()
const articles = loadArticleRecords()
const positions = loadPositions()

if (dealers.length !== 128) throw new Error(`Erwartet 128 Händler, bekam ${dealers.length}`)
if (articles.length !== 48) throw new Error(`Erwartet 48 Artikel, bekam ${articles.length}`)
if (positions.length !== 104) throw new Error(`Erwartet 104 Positionen, bekam ${positions.length}`)

mkdirSync(OUT, { recursive: true })
writeFileSync(OUT + '06_dealers.sql', genDealers(dealers))
writeFileSync(OUT + '07_articles.sql', genArticles(articles))
writeFileSync(OUT + '08_nepal.sql', genNepal(positions))
writeFileSync(OUT + '09_verify.sql', genVerify())
console.log(`✓ Geschrieben nach ${OUT}: 06_dealers.sql (128), 07_articles.sql (48), 08_nepal.sql (104), 09_verify.sql`)
