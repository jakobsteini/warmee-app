import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isInvoiceLocked,
  isDeliveryNoteLocked,
} from '../types/invoice.ts'

// ─── Rechnung ────────────────────────────────────────────────────────────────

test('isInvoiceLocked: Entwurf ist offen (nicht gesperrt)', () => {
  assert.equal(isInvoiceLocked('draft'), false)
})

test('isInvoiceLocked: ab „versendet" eingefroren (auch bezahlt/storniert)', () => {
  assert.equal(isInvoiceLocked('sent'), true)
  assert.equal(isInvoiceLocked('paid'), true)
  assert.equal(isInvoiceLocked('cancelled'), true)
})

test('isInvoiceLocked: unbekannter Status → gesperrt (sicher)', () => {
  assert.equal(isInvoiceLocked('whatever'), true)
})

// ─── Lieferschein ────────────────────────────────────────────────────────────

test('isDeliveryNoteLocked: Entwurf ist offen (nicht gesperrt)', () => {
  assert.equal(isDeliveryNoteLocked('draft'), false)
})

test('isDeliveryNoteLocked: ab „versendet" eingefroren (auch storniert)', () => {
  assert.equal(isDeliveryNoteLocked('sent'), true)
  assert.equal(isDeliveryNoteLocked('cancelled'), true)
})

test('isDeliveryNoteLocked: unbekannter Status → gesperrt (sicher)', () => {
  assert.equal(isDeliveryNoteLocked('whatever'), true)
})
