import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assetGroup,
  availableGroups,
  filterAssets,
  isOpenAsset,
  openAssignableCount,
} from './assetFilter.ts'
import type { AssetWithMeta } from '../types/asset.ts'

/** Knappes Test-Asset — nur die vom Filter gelesenen Felder, Rest gecastet. */
function asset(partial: Partial<AssetWithMeta>): AssetWithMeta {
  return {
    filename: '',
    asset_type: 'product',
    model: null,
    color_code: null,
    color_name: null,
    color_code_2: null,
    color_name_2: null,
    product: null,
    ...partial,
  } as AssetWithMeta
}

const emy = asset({
  filename: 'EmyShaded_530_olivine.JPG',
  model: 'EmyShaded',
  color_code: '530',
  color_name: 'olivine',
  product: { id: 'p1', name: 'Emy Pullover', style: 'Sweater Cas', category: 'sweater' },
})
const scarf = asset({
  filename: '900_ecru.JPG',
  color_code: '900',
  color_name: 'ecru',
  product: { id: 'p2', name: 'Loop Schal', style: 'Scarves Ca', category: 'scarf' },
})
const orphan = asset({ filename: 'lifestyle_shot.JPG', asset_type: 'lifestyle', product: null })
const swatch = asset({
  filename: '16_black.JPG',
  asset_type: 'swatch',
  color_code: '16',
  color_name: 'black',
  product: null,
})

const all = [emy, scarf, orphan, swatch]

test('assetGroup: Kategorie des verknüpften Artikels, sonst null', () => {
  assert.equal(assetGroup(emy), 'sweater')
  assert.equal(assetGroup(orphan), null)
})

test('availableGroups: nur vorkommende Gruppen, nach Label sortiert', () => {
  // Labels: scarf=Schal, sweater=Pullover → alphabetisch Pullover vor Schal.
  assert.deepEqual(availableGroups(all), ['sweater', 'scarf'])
})

test('filterAssets: Typ filtert hart (primäre Achse)', () => {
  assert.deepEqual(filterAssets(all, { type: 'swatch', search: '', group: null }), [swatch])
  assert.deepEqual(filterAssets(all, { type: 'lifestyle', search: '', group: null }), [orphan])
})

test('filterAssets: Gruppe filtert nur bei Produktfoto', () => {
  assert.deepEqual(
    filterAssets(all, { type: 'product', search: '', group: 'scarf' }),
    [scarf],
  )
})

test('filterAssets: Gruppe wird ohne Typ=Produktfoto ignoriert', () => {
  // group gesetzt, aber type=null → Gruppe greift nicht (sekundäre Achse).
  assert.deepEqual(filterAssets(all, { type: null, search: '', group: 'scarf' }), all)
})

test('filterAssets: Suche trifft Dateiname, Modell, Farbe', () => {
  assert.deepEqual(filterAssets(all, { type: null, search: 'olivine', group: null }), [emy])
  assert.deepEqual(filterAssets(all, { type: null, search: 'emyshaded', group: null }), [emy])
})

test('filterAssets: Suche trifft Farbmuster über color_code/color_name', () => {
  assert.deepEqual(filterAssets(all, { type: null, search: 'black', group: null }), [swatch])
  assert.deepEqual(filterAssets(all, { type: null, search: '16', group: null }), [swatch])
})

test('filterAssets: Suche trifft Name/Style des verknüpften Artikels', () => {
  assert.deepEqual(filterAssets(all, { type: null, search: 'loop', group: null }), [scarf])
  assert.deepEqual(filterAssets(all, { type: null, search: 'scarves ca', group: null }), [scarf])
})

test('filterAssets: Typ UND Gruppe UND Suche zusammen', () => {
  assert.deepEqual(
    filterAssets(all, { type: 'product', search: 'ecru', group: 'sweater' }),
    [],
  )
})

test('filterAssets: leere Suche + kein Typ + keine Gruppe = alles', () => {
  assert.deepEqual(filterAssets(all, { type: null, search: '  ', group: null }), all)
})

// ─── Offen-Definition (Fortschritt + Nav-Sichtbarkeit) ───────────────────────

/** Minimal-Asset nur mit den von isOpenAsset/openAssignableCount gelesenen Feldern. */
function openAsset(p: {
  product_id?: string | null
  no_product_match?: boolean
  asset_type?: AssetWithMeta['asset_type']
}) {
  return {
    product_id: p.product_id ?? null,
    no_product_match: p.no_product_match ?? false,
    asset_type: p.asset_type ?? 'product',
  }
}

test('isOpenAsset: offen nur ohne Artikel UND ohne kein-Artikel-Flag', () => {
  assert.equal(isOpenAsset(openAsset({})), true) // product_id null, no_match false
  assert.equal(isOpenAsset(openAsset({ product_id: 'p1' })), false) // zugeordnet
  assert.equal(isOpenAsset(openAsset({ no_product_match: true })), false) // kein Artikel
  assert.equal(isOpenAsset(openAsset({ product_id: 'p1', no_product_match: true })), false)
})

test('openAssignableCount: zaehlt offene, aber KEINE Farbmuster (swatch)', () => {
  const assets = [
    openAsset({}), // offen, product → zaehlt
    openAsset({ asset_type: 'lifestyle' }), // offen, lifestyle → zaehlt
    openAsset({ asset_type: 'swatch' }), // offen, aber swatch → zaehlt NICHT
    openAsset({ product_id: 'p1' }), // zugeordnet → nein
    openAsset({ no_product_match: true }), // kein Artikel → nein
  ]
  assert.equal(openAssignableCount(assets), 2)
})

test('openAssignableCount: nur offene Farbmuster → 0 (Nav-Eintrag bleibt aus)', () => {
  // Deckt den realen Ist-Stand ab: 36 offene, allesamt swatch → "0 offen".
  const swatches = Array.from({ length: 5 }, () => openAsset({ asset_type: 'swatch' }))
  assert.equal(openAssignableCount(swatches), 0)
})
