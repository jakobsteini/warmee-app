import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assetGroup, availableGroups, filterAssets } from './assetFilter.ts'
import type { AssetWithMeta } from '../types/asset.ts'

/** Knappes Test-Asset — nur die vom Filter gelesenen Felder, Rest gecastet. */
function asset(partial: Partial<AssetWithMeta>): AssetWithMeta {
  return {
    filename: '',
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
const orphan = asset({ filename: 'lifestyle_shot.JPG', product: null })

const all = [emy, scarf, orphan]

test('assetGroup: Kategorie des verknüpften Artikels, sonst null', () => {
  assert.equal(assetGroup(emy), 'sweater')
  assert.equal(assetGroup(orphan), null)
})

test('availableGroups: nur vorkommende Gruppen, nach Label sortiert', () => {
  // Labels: scarf=Schal, sweater=Pullover → alphabetisch Pullover vor Schal.
  assert.deepEqual(availableGroups(all), ['sweater', 'scarf'])
})

test('filterAssets: Gruppe filtert hart', () => {
  assert.deepEqual(filterAssets(all, { search: '', group: 'scarf' }), [scarf])
})

test('filterAssets: Suche trifft Dateiname, Modell, Farbe', () => {
  assert.deepEqual(filterAssets(all, { search: 'olivine', group: null }), [emy])
  assert.deepEqual(filterAssets(all, { search: 'emyshaded', group: null }), [emy])
})

test('filterAssets: Suche trifft Name/Style des verknüpften Artikels', () => {
  assert.deepEqual(filterAssets(all, { search: 'loop', group: null }), [scarf])
  assert.deepEqual(filterAssets(all, { search: 'scarves ca', group: null }), [scarf])
})

test('filterAssets: Gruppe UND Suche zusammen', () => {
  assert.deepEqual(filterAssets(all, { search: 'ecru', group: 'sweater' }), [])
})

test('filterAssets: leere Suche + keine Gruppe = alles', () => {
  assert.deepEqual(filterAssets(all, { search: '  ', group: null }), all)
})
