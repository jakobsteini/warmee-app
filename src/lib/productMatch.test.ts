import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  suggestProducts,
  filterProducts,
  productLabel,
  exactProductMatch,
} from './productMatch.ts'
import type { Product } from '../types/product.ts'

/** Minimaler Product-Builder – nur die für den Match relevanten Felder. */
function p(id: string, style: string | null, name = style ?? id): Product {
  return {
    id,
    org_id: 'o',
    name,
    category: null,
    color: null,
    retail_price: null,
    wholesale_price: null,
    purchase_price: null,
    season_id: null,
    created_at: null,
    style,
    composition: null,
    gauge: null,
    ply: null,
    yarn_count: null,
    weight: null,
    note: null,
  }
}

const catalog: Product[] = [
  p('1', 'Alois West'),
  p('2', 'Amelie Cardigan'),
  p('3', 'Celia'),
  p('4', 'Celia Long'),
]

test('exakter Treffer steht vor Teilstring-Treffer', () => {
  const s = suggestProducts('celia', catalog)
  assert.equal(s[0].product.id, '3') // "Celia" exakt
  assert.equal(s[0].kind, 'exact')
  assert.equal(s[1].product.id, '4') // "Celia Long" enthält "celia"
  assert.equal(s[1].kind, 'contains')
})

test('Teilstring: model in style ("alois" → "Alois West")', () => {
  const s = suggestProducts('alois', catalog)
  assert.equal(s.length, 1)
  assert.equal(s[0].product.id, '1')
  assert.equal(s[0].kind, 'contains')
})

test('Teilstring: "amelie" → "Amelie Cardigan"', () => {
  const s = suggestProducts('amelie', catalog)
  assert.deepEqual(
    s.map((x) => x.product.id),
    ['2'],
  )
})

test('umgekehrte Richtung: style in model ("celia long sonderedition" → "Celia", "Celia Long")', () => {
  const s = suggestProducts('celia long sonderedition', catalog)
  const ids = s.map((x) => x.product.id)
  assert.ok(ids.includes('3'))
  assert.ok(ids.includes('4'))
})

test('kein model → keine Vorschläge', () => {
  assert.deepEqual(suggestProducts(null, catalog), [])
  assert.deepEqual(suggestProducts('   ', catalog), [])
})

test('kein Treffer → leere Liste', () => {
  assert.deepEqual(suggestProducts('ghostmodel', catalog), [])
})

test('productLabel: style bevorzugt, sonst name', () => {
  assert.equal(productLabel(p('9', 'StyleX', 'NameX')), 'StyleX')
  assert.equal(productLabel(p('9', null, 'NameX')), 'NameX')
  assert.equal(productLabel(p('9', '   ', 'NameX')), 'NameX')
})

test('filterProducts: leere Anfrage → alle (alphabetisch)', () => {
  const r = filterProducts('', catalog)
  assert.deepEqual(
    r.map((x) => productLabel(x)),
    ['Alois West', 'Amelie Cardigan', 'Celia', 'Celia Long'],
  )
})

test('filterProducts: Teilstring, case-insensitive', () => {
  const r = filterProducts('cel', catalog)
  assert.deepEqual(
    r.map((x) => x.id),
    ['3', '4'],
  )
})

// ─── exactProductMatch: nur-Buchstaben, exakt, gegen products.name ──────────

/** Katalog mit Leerzeichen/Kleinschreibung in `name` wie in den Echtdaten. */
const nameCatalog: Product[] = [
  p('a', null, 'Axis felted shaded'),
  p('b', null, 'Axis felted'),
  p('c', null, 'Flap Me felted'),
  p('d', null, 'Isa shaded'),
]

test('exactProductMatch: CamelCase-Modell trifft Name mit Leerzeichen exakt', () => {
  const hit = exactProductMatch('AxisFeltedShaded', nameCatalog)
  assert.equal(hit?.id, 'a')
})

test('exactProductMatch: KEINE Präfix-Logik ("AxisFelted" trifft nicht "Axis felted shaded")', () => {
  // "axisfelted" gleicht nur "Axis felted" (b), nicht die längere Variante (a).
  const hit = exactProductMatch('AxisFelted', nameCatalog)
  assert.equal(hit?.id, 'b')
})

test('exactProductMatch: Variante ohne eigenen Artikel → kein Treffer (null)', () => {
  // "ElderFeltedTw" existiert nicht als Artikel → kein_treffer.
  assert.equal(exactProductMatch('ElderFeltedTw', nameCatalog), null)
})

test('exactProductMatch: mehrdeutig (>1 gleicher Name) → null', () => {
  const dup: Product[] = [p('x', null, 'Isa shaded'), p('y', null, 'Isa Shaded')]
  assert.equal(exactProductMatch('IsaShaded', dup), null)
})

test('exactProductMatch: kein Modell (null/leer/nur Ziffern) → null', () => {
  assert.equal(exactProductMatch(null, nameCatalog), null)
  assert.equal(exactProductMatch('   ', nameCatalog), null)
  assert.equal(exactProductMatch('530', nameCatalog), null)
})
