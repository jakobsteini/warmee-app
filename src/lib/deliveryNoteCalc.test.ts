import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  belegItemsFromNoteItems,
  deliveryNoteTotalQuantity,
} from './deliveryNoteCalc.ts'

test('belegItemsFromNoteItems: übernimmt nur die Belegfelder', () => {
  const out = belegItemsFromNoteItems([
    { description: 'Schal', color: 'Sand', size: null, quantity: 3 },
  ])
  assert.deepEqual(out, [
    { description: 'Schal', color: 'Sand', size: null, quantity: 3 },
  ])
})

test('deliveryNoteTotalQuantity: summiert die Mengen', () => {
  assert.equal(
    deliveryNoteTotalQuantity([{ quantity: 3 }, { quantity: 2 }, { quantity: 0 }]),
    5,
  )
})

test('deliveryNoteTotalQuantity: leere Liste → 0', () => {
  assert.equal(deliveryNoteTotalQuantity([]), 0)
})
