import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  belegTypForDocuments,
  kundentypFromAssignments,
} from './mailPayload.ts'

test('belegTypForDocuments: alle Kombinationen', () => {
  assert.equal(
    belegTypForDocuments({ hasInvoice: true, hasNote: true }),
    'rechnung_lieferschein',
  )
  assert.equal(belegTypForDocuments({ hasInvoice: true, hasNote: false }), 'rechnung')
  assert.equal(belegTypForDocuments({ hasInvoice: false, hasNote: true }), 'lieferschein')
  assert.equal(belegTypForDocuments({ hasInvoice: false, hasNote: false }), null)
})

test('kundentypFromAssignments: agent gewinnt (auch gemischt)', () => {
  assert.equal(kundentypFromAssignments(['agent']), 'agent')
  assert.equal(kundentypFromAssignments(['agent', 'internal']), 'agent')
  assert.equal(kundentypFromAssignments(['internal', 'agent']), 'agent')
})

test('kundentypFromAssignments: nur internal → internal', () => {
  assert.equal(kundentypFromAssignments(['internal']), 'internal')
  assert.equal(kundentypFromAssignments(['internal', 'internal']), 'internal')
})

test('kundentypFromAssignments: leer → internal (kein CC)', () => {
  assert.equal(kundentypFromAssignments([]), 'internal')
})
