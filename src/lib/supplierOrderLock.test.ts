import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSupplierOrderLocked } from '../types/productionOrder.ts'

test('isSupplierOrderLocked: Entwurf ist editierbar (nicht gesperrt)', () => {
  assert.equal(isSupplierOrderLocked('draft'), false)
})

test('isSupplierOrderLocked: ab „gesendet" eingefroren', () => {
  assert.equal(isSupplierOrderLocked('sent'), true)
  assert.equal(isSupplierOrderLocked('in_production'), true)
  assert.equal(isSupplierOrderLocked('shipped'), true)
  assert.equal(isSupplierOrderLocked('received'), true)
})

test('isSupplierOrderLocked: unbekannter Status → gesperrt (sicher)', () => {
  assert.equal(isSupplierOrderLocked('whatever'), true)
})
