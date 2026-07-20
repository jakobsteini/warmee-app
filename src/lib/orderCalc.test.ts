import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totalQuantity, totalAmount } from './orderCalc.ts'

// ─── totalQuantity ──────────────────────────────────────────────────────────
test('totalQuantity: leere Order → 0', () => {
  assert.equal(totalQuantity([]), 0)
})

test('totalQuantity: eine Position', () => {
  assert.equal(totalQuantity([{ quantity: 5, unit_price: 10 }]), 5)
})

test('totalQuantity: mehrere Positionen summieren', () => {
  assert.equal(
    totalQuantity([
      { quantity: 3, unit_price: 10 },
      { quantity: 7, unit_price: 20 },
      { quantity: 2, unit_price: 5 },
    ]),
    12,
  )
})

test('totalQuantity: Menge 0 zählt als 0 (keine Wirkung)', () => {
  assert.equal(
    totalQuantity([
      { quantity: 0, unit_price: 99 },
      { quantity: 4, unit_price: 10 },
    ]),
    4,
  )
})

// ─── totalAmount (reuse von lineTotal) ──────────────────────────────────────
test('totalAmount: leere Order → 0', () => {
  assert.equal(totalAmount([]), 0)
})

test('totalAmount: eine Position (Menge × Preis)', () => {
  // lineTotal rundet NICHT (wie die bestehende Zeilenlogik); die Anzeige rundet
  // über formatEUR. Daher exakt darstellbarer Wert im Test.
  assert.equal(totalAmount([{ quantity: 3, unit_price: 10.5 }]), 31.5)
})

test('totalAmount: mehrere Positionen, numeric-String robust', () => {
  assert.equal(
    totalAmount([
      { quantity: 2, unit_price: '10.00' },
      { quantity: 3, unit_price: 20 },
    ]),
    80,
  )
})

test('totalAmount: Menge 0 / fehlender Preis → 0-Anteil, kein NaN', () => {
  assert.equal(
    totalAmount([
      { quantity: 0, unit_price: 50 },
      { quantity: 5, unit_price: null },
      { quantity: 2, unit_price: 10 },
    ]),
    20,
  )
})
