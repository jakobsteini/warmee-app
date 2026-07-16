import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  returnedQuantities,
  remainingReturnable,
  canReturnQuantity,
  returnTotal,
  openAfterReturns,
  type ReturnableItem,
  type ExistingReturn,
} from './returnsCalc.ts'

// Eine Rechnung mit zwei Positionen: A (10 Stück), B (4 Stück).
const ITEMS: ReturnableItem[] = [
  { id: 'A', quantity: 10 },
  { id: 'B', quantity: 4 },
]

/** Kurzschreibweise für einen bestehenden Retouren-Vorgang. */
function ret(
  status: 'recorded' | 'cancelled',
  items: { invoice_item_id: string; quantity: number }[],
): ExistingReturn {
  return { status, items }
}

test('Teilretoure: mindert die noch retournierbare Menge der Position', () => {
  const rem = remainingReturnable(ITEMS, [ret('recorded', [{ invoice_item_id: 'A', quantity: 3 }])])
  assert.equal(rem.get('A'), 7) // 10 − 3
  assert.equal(rem.get('B'), 4) // unberührt
})

test('Retoure über die gelieferte Menge hinaus muss scheitern', () => {
  const rem = remainingReturnable(ITEMS, [ret('recorded', [{ invoice_item_id: 'A', quantity: 8 }])])
  const restA = rem.get('A') ?? 0 // 2
  assert.equal(canReturnQuantity(restA, 2), true) // exakt der Rest ist ok
  assert.equal(canReturnQuantity(restA, 3), false) // eins zu viel → blockt
  // Auch direkt gegen die volle Menge: mehr als geliefert geht nie.
  assert.equal(canReturnQuantity(10, 11), false)
})

test('canReturnQuantity: nur positive ganze Zahlen', () => {
  assert.equal(canReturnQuantity(5, 0), false)
  assert.equal(canReturnQuantity(5, -1), false)
  assert.equal(canReturnQuantity(5, 2.5), false)
  assert.equal(canReturnQuantity(5, 5), true)
})

test('mehrere Retouren auf dieselbe Rechnung summieren sich', () => {
  const existing = [
    ret('recorded', [{ invoice_item_id: 'A', quantity: 3 }]),
    ret('recorded', [{ invoice_item_id: 'A', quantity: 2 }, { invoice_item_id: 'B', quantity: 1 }]),
  ]
  assert.equal(returnedQuantities(existing).get('A'), 5) // 3 + 2
  const rem = remainingReturnable(ITEMS, existing)
  assert.equal(rem.get('A'), 5) // 10 − 5
  assert.equal(rem.get('B'), 3) // 4 − 1
})

test('Storno zählt nicht: cancelled-Vorgang mindert nichts', () => {
  const existing = [
    ret('recorded', [{ invoice_item_id: 'A', quantity: 2 }]),
    ret('cancelled', [{ invoice_item_id: 'A', quantity: 6 }]), // storniert → ignoriert
  ]
  assert.equal(returnedQuantities(existing).get('A'), 2)
  assert.equal(remainingReturnable(ITEMS, existing).get('A'), 8) // 10 − 2, nicht 10 − 8
})

test('remainingReturnable clampt bei 0 (kein negativer Rest)', () => {
  const rem = remainingReturnable(ITEMS, [ret('recorded', [{ invoice_item_id: 'B', quantity: 4 }])])
  assert.equal(rem.get('B'), 0)
})

test('returnTotal: Menge × Preis, robust gegen numeric-Strings', () => {
  assert.equal(returnTotal([{ quantity: 3, unit_price: '19.90' }]), 59.7)
  assert.equal(
    returnTotal([
      { quantity: 2, unit_price: 10 },
      { quantity: 1, unit_price: 5.5 },
    ]),
    25.5,
  )
  assert.equal(returnTotal([]), 0)
})

test('openAfterReturns: offener Rest, nie unter 0', () => {
  assert.equal(openAfterReturns('100.00', 30), 70)
  assert.equal(openAfterReturns(100, 100), 0) // voll gutgeschrieben
  assert.equal(openAfterReturns(100, 140), 0) // clamp, kein Negativbetrag
})
