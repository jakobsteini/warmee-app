import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateStock,
  normalizeColorKey,
  totalPieces,
  type ProductMeta,
  type StockAggInput,
} from './stockListCalc.ts'

const META = new Map<string, ProductMeta>([
  ['P', { name: 'Axis felted', wholesale_price: 120 }],
  ['Q', { name: 'Basel scarf', wholesale_price: '95.50' }],
])

test('aggregiert je (Artikel, Farbe), summiert über Größe + Variante', () => {
  const rows: StockAggInput[] = [
    { product_id: 'P', color: 'camel', bestand: 3 }, // Größe M
    { product_id: 'P', color: 'camel', bestand: 4 }, // Größe L
    { product_id: 'P', color: 'camel', bestand: 2 }, // andere Variante, gleiche Farbe
  ]
  const out = aggregateStock(rows, META)
  assert.equal(out.length, 1)
  assert.equal(out[0].pieces, 9) // 3 + 4 + 2 über Größe + Variante
  assert.equal(out[0].article, 'Axis felted')
  assert.equal(out[0].wholesalePrice, 120)
})

test('verschiedene Farben bleiben getrennte Zeilen', () => {
  const out = aggregateStock(
    [
      { product_id: 'P', color: 'camel', bestand: 5 },
      { product_id: 'P', color: 'ecru', bestand: 2 },
    ],
    META,
  )
  assert.equal(out.length, 2)
})

test('exakte Farbe: "Camel" und "camel" bleiben getrennt (kein stilles Mergen)', () => {
  const out = aggregateStock(
    [
      { product_id: 'P', color: 'Camel', bestand: 5 },
      { product_id: 'P', color: 'camel', bestand: 3 },
    ],
    META,
  )
  assert.equal(out.length, 2)
})

test('Stück ≤ 0 (leer/negativ) fällt aus der Kundenliste', () => {
  const out = aggregateStock(
    [
      { product_id: 'P', color: 'camel', bestand: 4 },
      { product_id: 'P', color: 'camel', bestand: -4 }, // netto 0 → raus
      { product_id: 'Q', color: 'black', bestand: -2 }, // negativ → raus
    ],
    META,
  )
  assert.equal(out.length, 0)
})

test('Preis aus String-numeric geparst; unbekannter Artikel → Name/Preis-Fallback', () => {
  const out = aggregateStock(
    [
      { product_id: 'Q', color: 'black', bestand: 6 },
      { product_id: 'X', color: 'red', bestand: 1 }, // nicht in META
    ],
    META,
  )
  const q = out.find((r) => r.product_id === 'Q')!
  const x = out.find((r) => r.product_id === 'X')!
  assert.equal(q.wholesalePrice, 95.5)
  assert.equal(x.article, '—')
  assert.equal(x.wholesalePrice, null)
})

test('sortiert nach Artikel, dann Farbe', () => {
  const out = aggregateStock(
    [
      { product_id: 'Q', color: 'black', bestand: 1 },
      { product_id: 'P', color: 'ecru', bestand: 1 },
      { product_id: 'P', color: 'camel', bestand: 1 },
    ],
    META,
  )
  assert.deepEqual(
    out.map((r) => `${r.article}/${r.color}`),
    ['Axis felted/camel', 'Axis felted/ecru', 'Basel scarf/black'],
  )
})

test('normalizeColorKey: getrimmt + kleingeschrieben', () => {
  assert.equal(normalizeColorKey('Camel'), 'camel')
  assert.equal(normalizeColorKey('  camel '), 'camel')
  assert.equal(normalizeColorKey(null), '')
})

test('totalPieces summiert die ausgewiesenen Zeilen', () => {
  const out = aggregateStock(
    [
      { product_id: 'P', color: 'camel', bestand: 9 },
      { product_id: 'Q', color: 'black', bestand: 6 },
    ],
    META,
  )
  assert.equal(totalPieces(out), 15)
})
