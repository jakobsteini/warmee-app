import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeGroupName,
  validateGroupName,
  groupInUse,
  groupArticleCounts,
  evaluateArticleGroups,
  type GroupEvalPosition,
} from './articleGroups.ts'

/** Kompakte Position bauen (nur die vom Kern gelesenen Felder). */
function pos(p: Partial<GroupEvalPosition>): GroupEvalPosition {
  return {
    group_id: null,
    product_id: 'p',
    quantity: 0,
    unit_price: null,
    wholesale_price: null,
    ...p,
  }
}

// ─── validateGroupName ───────────────────────────────────────────────────────

test('validateGroupName: leerer/whitespace Name → Fehler', () => {
  assert.deepEqual(validateGroupName('', []), {
    ok: false,
    error: 'articleGroups.err.nameEmpty',
  })
  assert.deepEqual(validateGroupName('   ', []), {
    ok: false,
    error: 'articleGroups.err.nameEmpty',
  })
})

test('validateGroupName: gültiger Name → getrimmt zurück', () => {
  assert.deepEqual(validateGroupName('  Mützen  ', []), {
    ok: true,
    value: 'Mützen',
  })
})

test('validateGroupName: Duplikat (case-insensitiv, getrimmt) → Fehler', () => {
  assert.deepEqual(validateGroupName('Mützen', ['Schals', 'Mützen']), {
    ok: false,
    error: 'articleGroups.err.nameDuplicate',
  })
  assert.deepEqual(validateGroupName('  mützen ', ['Mützen']), {
    ok: false,
    error: 'articleGroups.err.nameDuplicate',
  })
})

test('validateGroupName: ähnlicher, aber anderer Name → ok', () => {
  assert.deepEqual(validateGroupName('Mütze', ['Mützen']), {
    ok: true,
    value: 'Mütze',
  })
})

test('normalizeGroupName: nur trimmen, Groß/Klein bleibt', () => {
  assert.equal(normalizeGroupName('  Cardigan '), 'Cardigan')
})

// ─── groupInUse ──────────────────────────────────────────────────────────────

test('groupInUse: Gruppe mit Artikel → true, ohne → false', () => {
  const products = [{ group_id: 'g1' }, { group_id: null }, { group_id: 'g2' }]
  assert.equal(groupInUse('g1', products), true)
  assert.equal(groupInUse('g2', products), true)
  assert.equal(groupInUse('g3', products), false)
  assert.equal(groupInUse('g1', []), false)
})

// ─── groupArticleCounts ──────────────────────────────────────────────────────

test('groupArticleCounts: Zählung je Gruppe + ohne Gruppe, Reihenfolge stabil', () => {
  const groups = [
    { id: 'g1', name: 'Mützen' },
    { id: 'g2', name: 'Schals' },
    { id: 'g3', name: 'leer' },
  ]
  const products = [
    { group_id: 'g1' },
    { group_id: 'g1' },
    { group_id: 'g2' },
    { group_id: null },
    { group_id: null },
  ]
  assert.deepEqual(groupArticleCounts(products, groups), {
    counts: [
      { id: 'g1', name: 'Mützen', count: 2 },
      { id: 'g2', name: 'Schals', count: 1 },
      { id: 'g3', name: 'leer', count: 0 },
    ],
    ungrouped: 2,
  })
})

test('groupArticleCounts: keine Artikel → alle 0, ungrouped 0', () => {
  assert.deepEqual(
    groupArticleCounts([], [{ id: 'g1', name: 'Mützen' }]),
    { counts: [{ id: 'g1', name: 'Mützen', count: 0 }], ungrouped: 0 },
  )
})

// ─── evaluateArticleGroups ───────────────────────────────────────────────────

test('evaluateArticleGroups: Menge + Netto-Umsatz je Gruppe (Cent-genau)', () => {
  const positions = [
    pos({ group_id: 'g1', product_id: 'a', quantity: 2, unit_price: '10.00' }),
    pos({ group_id: 'g1', product_id: 'b', quantity: 1, unit_price: 5 }),
    pos({ group_id: 'g2', product_id: 'c', quantity: 3, unit_price: '20.00' }),
  ]
  const { rows, total } = evaluateArticleGroups(positions, [
    { id: 'g1' },
    { id: 'g2' },
  ])
  // g2: 3×20 = 60 € (6000 ct) vor g1: 2×10 + 1×5 = 25 € (2500 ct)
  assert.deepEqual(
    rows.map((r) => [r.id, r.articleCount, r.quantity, r.netCents]),
    [
      ['g2', 1, 3, 6000],
      ['g1', 2, 3, 2500],
    ],
  )
  assert.deepEqual(total, { articleCount: 3, quantity: 6, netCents: 8500 })
})

test('evaluateArticleGroups: Summe der Zeilen == Gesamtsumme (keine Drift)', () => {
  const positions = [
    pos({ group_id: 'g1', product_id: 'a', quantity: 3, unit_price: '0.10' }),
    pos({ group_id: 'g2', product_id: 'b', quantity: 7, unit_price: '0.10' }),
    pos({ group_id: 'g1', product_id: 'c', quantity: 1, unit_price: '19.99' }),
  ]
  const { rows, total } = evaluateArticleGroups(positions, [{ id: 'g1' }, { id: 'g2' }])
  const sumCents = rows.reduce((s, r) => s + r.netCents, 0)
  assert.equal(sumCents, total.netCents)
  assert.equal(total.netCents, 30 + 70 + 1999) // 0.30 + 0.70 + 19.99 €
})

test('evaluateArticleGroups: Artikel ohne Gruppe als eigene Zeile (kein Verlust)', () => {
  const positions = [
    pos({ group_id: 'g1', product_id: 'a', quantity: 1, unit_price: '10.00' }),
    pos({ group_id: null, product_id: 'x', quantity: 5, unit_price: '4.00' }),
  ]
  const { rows } = evaluateArticleGroups(positions, [{ id: 'g1' }])
  const ungrouped = rows.find((r) => r.id === null)
  assert.ok(ungrouped, 'ohne-Gruppe-Zeile muss existieren')
  assert.deepEqual([ungrouped.articleCount, ungrouped.quantity, ungrouped.netCents], [1, 5, 2000])
})

test('evaluateArticleGroups: leere Gruppe bleibt als 0-Zeile sichtbar', () => {
  const { rows } = evaluateArticleGroups([], [{ id: 'g1' }, { id: 'g2' }])
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r) => r.quantity === 0 && r.netCents === 0 && r.articleCount === 0))
})

test('evaluateArticleGroups: keine ungruppierte Ware → keine ohne-Gruppe-Zeile', () => {
  const positions = [pos({ group_id: 'g1', product_id: 'a', quantity: 1, unit_price: '1.00' })]
  const { rows } = evaluateArticleGroups(positions, [{ id: 'g1' }])
  assert.ok(!rows.some((r) => r.id === null))
})

test('evaluateArticleGroups: unit_price fehlt → Fallback wholesale_price', () => {
  const positions = [
    pos({ group_id: 'g1', product_id: 'a', quantity: 2, unit_price: null, wholesale_price: '12.50' }),
  ]
  const { rows } = evaluateArticleGroups(positions, [{ id: 'g1' }])
  assert.equal(rows[0].netCents, 2500) // 2 × 12,50 €
})

test('evaluateArticleGroups: distinct Artikelzahl (gleiche product_id nicht doppelt)', () => {
  const positions = [
    pos({ group_id: 'g1', product_id: 'a', quantity: 1, unit_price: '1.00' }),
    pos({ group_id: 'g1', product_id: 'a', quantity: 2, unit_price: '1.00' }),
    pos({ group_id: 'g1', product_id: 'b', quantity: 1, unit_price: '1.00' }),
  ]
  const { rows } = evaluateArticleGroups(positions, [{ id: 'g1' }])
  assert.equal(rows[0].articleCount, 2) // a + b, nicht 3
  assert.equal(rows[0].quantity, 4)
})
