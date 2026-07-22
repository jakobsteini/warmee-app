import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  orderedProductIds,
  dealerImageAssets,
  groupImagesByArticle,
} from './dealerImages.ts'
import type { AssetProductRef, AssetWithMeta } from '../types/asset.ts'

/** Knappes Test-Asset — nur die vom Kern gelesenen Felder, Rest gecastet. */
function asset(partial: Partial<AssetWithMeta>): AssetWithMeta {
  return {
    id: 'a',
    filename: '',
    asset_kind: 'photo',
    product_id: null,
    product: null,
    ...partial,
  } as AssetWithMeta
}

function product(id: string, name: string): AssetProductRef {
  return { id, name, style: null, category: null }
}

test('orderedProductIds: distinct, ohne null, sortiert', () => {
  const ids = orderedProductIds([
    { product_id: 'p2' },
    { product_id: 'p1' },
    { product_id: 'p2' },
    { product_id: null },
    { product_id: 'p1' },
  ])
  assert.deepEqual(ids, ['p1', 'p2'])
})

test('orderedProductIds: leere Liste → leer', () => {
  assert.deepEqual(orderedProductIds([]), [])
})

test('dealerImageAssets: nur Bilder zu bestellten Artikeln', () => {
  const assets = [
    asset({ id: '1', filename: 'a.jpg', product_id: 'p1' }),
    asset({ id: '2', filename: 'b.jpg', product_id: 'p9' }), // nicht bestellt
    asset({ id: '3', filename: 'c.jpg', product_id: 'p2' }),
  ]
  const out = dealerImageAssets(assets, ['p1', 'p2'])
  assert.deepEqual(
    out.map((a) => a.id),
    ['1', '3'],
  )
})

test('dealerImageAssets: Videos raus, nur Fotos', () => {
  const assets = [
    asset({ id: '1', filename: 'a.jpg', product_id: 'p1', asset_kind: 'photo' }),
    asset({ id: '2', filename: 'v.mp4', product_id: 'p1', asset_kind: 'video' }),
  ]
  const out = dealerImageAssets(assets, ['p1'])
  assert.deepEqual(
    out.map((a) => a.id),
    ['1'],
  )
})

test('dealerImageAssets: Duplikate (gleiche id) raus', () => {
  const assets = [
    asset({ id: '1', filename: 'a.jpg', product_id: 'p1' }),
    asset({ id: '1', filename: 'a.jpg', product_id: 'p1' }),
  ]
  assert.equal(dealerImageAssets(assets, ['p1']).length, 1)
})

test('dealerImageAssets: deterministisch nach Dateiname, dann id', () => {
  const assets = [
    asset({ id: 'z', filename: 'b.jpg', product_id: 'p1' }),
    asset({ id: 'a', filename: 'a.jpg', product_id: 'p1' }),
    asset({ id: 'b', filename: 'a.jpg', product_id: 'p1' }),
  ]
  const out = dealerImageAssets(assets, ['p1'])
  assert.deepEqual(
    out.map((a) => a.id),
    ['a', 'b', 'z'],
  )
})

test('dealerImageAssets: leere Bestellung → leere Bildliste, kein Fehler', () => {
  const assets = [asset({ id: '1', filename: 'a.jpg', product_id: 'p1' })]
  assert.deepEqual(dealerImageAssets(assets, []), [])
})

test('dealerImageAssets: Bild ohne product_id wird ignoriert', () => {
  const assets = [asset({ id: '1', filename: 'a.jpg', product_id: null })]
  assert.deepEqual(dealerImageAssets(assets, ['p1']), [])
})

test('groupImagesByArticle: gruppiert nach Artikel, sortiert nach Name', () => {
  const assets = [
    asset({ id: '1', filename: 'a.jpg', product_id: 'p2', product: product('p2', 'Zeta') }),
    asset({ id: '2', filename: 'b.jpg', product_id: 'p1', product: product('p1', 'Alpha') }),
    asset({ id: '3', filename: 'c.jpg', product_id: 'p2', product: product('p2', 'Zeta') }),
  ]
  const groups = groupImagesByArticle(assets)
  assert.deepEqual(
    groups.map((g) => [g.product?.name, g.assets.length]),
    [
      ['Alpha', 1],
      ['Zeta', 2],
    ],
  )
})
