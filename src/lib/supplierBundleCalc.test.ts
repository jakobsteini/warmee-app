import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bundleOpenItems,
  missingProducerArticleNames,
  type BundleOrderItem,
} from './supplierBundleCalc.ts'

function item(p: Partial<BundleOrderItem> & { id: string }): BundleOrderItem {
  return {
    id: p.id,
    product_id: p.product_id ?? 'prodA',
    // explizites null soll null bleiben (nicht per ?? überschrieben werden).
    producer_id: 'producer_id' in p ? (p.producer_id ?? null) : 'sup1',
    product_name: p.product_name ?? 'Artikel',
    color: p.color ?? null,
    size: p.size ?? null,
    quantity: p.quantity ?? 1,
  }
}

test('bundleOpenItems: keine Positionen → leer', () => {
  assert.deepEqual(bundleOpenItems([]), { byProducer: [], missingProducer: [] })
})

test('bundleOpenItems: ein Lieferant, Aggregation nach Produkt/Farbe/Größe', () => {
  const res = bundleOpenItems([
    item({ id: 'i1', product_id: 'A', color: 'rot', size: 'M', quantity: 3 }),
    item({ id: 'i2', product_id: 'A', color: 'rot', size: 'M', quantity: 2 }),
    item({ id: 'i3', product_id: 'A', color: 'blau', size: 'M', quantity: 4 }),
  ])
  assert.equal(res.byProducer.length, 1)
  assert.deepEqual(res.byProducer[0].positions, [
    { product_id: 'A', color: 'blau', size: 'M', total: 4 },
    { product_id: 'A', color: 'rot', size: 'M', total: 5 },
  ])
  assert.deepEqual(res.byProducer[0].sourceItemIds.sort(), ['i1', 'i2', 'i3'])
})

test('bundleOpenItems: zwei Lieferanten → zwei Bündel, stabil sortiert', () => {
  const res = bundleOpenItems([
    item({ id: 'i1', producer_id: 'sup2', product_id: 'B', quantity: 1 }),
    item({ id: 'i2', producer_id: 'sup1', product_id: 'A', quantity: 5 }),
  ])
  assert.deepEqual(
    res.byProducer.map((b) => b.producer_id),
    ['sup1', 'sup2'],
  )
  assert.equal(res.byProducer[0].positions[0].total, 5)
  assert.equal(res.byProducer[1].positions[0].total, 1)
})

test('bundleOpenItems: bereits verbrauchte Positionen werden übersprungen', () => {
  const res = bundleOpenItems(
    [
      item({ id: 'i1', quantity: 3 }),
      item({ id: 'i2', quantity: 4 }),
    ],
    new Set(['i1']),
  )
  assert.equal(res.byProducer[0].positions[0].total, 4)
  assert.deepEqual(res.byProducer[0].sourceItemIds, ['i2'])
})

test('bundleOpenItems: consumedIds auch als Array akzeptiert', () => {
  const res = bundleOpenItems([item({ id: 'i1' }), item({ id: 'i2' })], ['i1'])
  assert.deepEqual(res.byProducer[0].sourceItemIds, ['i2'])
})

test('bundleOpenItems: Positionen ohne producer_id → missingProducer, nicht gebündelt', () => {
  const res = bundleOpenItems([
    item({ id: 'i1', producer_id: null, product_name: 'Mütze Camel' }),
    item({ id: 'i2', producer_id: 'sup1', quantity: 2 }),
  ])
  assert.equal(res.byProducer.length, 1)
  assert.equal(res.missingProducer.length, 1)
  assert.equal(res.missingProducer[0].id, 'i1')
})

test('missingProducerArticleNames: distinct Namen für die Block-Meldung', () => {
  const res = bundleOpenItems([
    item({ id: 'i1', producer_id: null, product_name: 'Mütze Camel' }),
    item({ id: 'i2', producer_id: null, product_name: 'Mütze Camel' }),
    item({ id: 'i3', producer_id: null, product_name: 'Schal Anthrazit' }),
  ])
  assert.deepEqual(missingProducerArticleNames(res), ['Mütze Camel', 'Schal Anthrazit'])
})
