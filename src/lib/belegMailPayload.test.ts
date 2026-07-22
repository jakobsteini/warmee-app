import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidEmail,
  belegMailSubject,
  attachmentFilename,
} from './belegMailPayload.ts'

test('isValidEmail: gültige vs. ungültige Adressen', () => {
  assert.equal(isValidEmail('a@b.co'), true)
  assert.equal(isValidEmail('  kunde@warm-me.com '), true)
  assert.equal(isValidEmail('kein-at'), false)
  assert.equal(isValidEmail('a@b'), false)
  assert.equal(isValidEmail(''), false)
  assert.equal(isValidEmail('a b@c.de'), false)
})

test('belegMailSubject: je nach vorhandenen Belegen (DE)', () => {
  assert.equal(
    belegMailSubject('de', { invoiceNumber: '2026-0001', noteNumber: 'LS-2026-0007' }),
    'WARM ME – Lieferschein & Rechnung 2026-0001',
  )
  assert.equal(belegMailSubject('de', { invoiceNumber: '2026-0001' }), 'WARM ME – Rechnung 2026-0001')
  assert.equal(belegMailSubject('de', { noteNumber: 'LS-2026-0007' }), 'WARM ME – Lieferschein LS-2026-0007')
})

test('belegMailSubject: englischer Kunde', () => {
  assert.equal(belegMailSubject('en', { invoiceNumber: '2026-0001' }), 'WARM ME – Invoice 2026-0001')
})

test('attachmentFilename: Belegart + Sprache', () => {
  assert.equal(attachmentFilename('invoice', '2026-0001', 'de'), 'Rechnung_2026-0001.pdf')
  assert.equal(attachmentFilename('delivery_note', 'LS-2026-0007', 'de'), 'Lieferschein_LS-2026-0007.pdf')
  assert.equal(attachmentFilename('invoice', '2026-0001', 'en'), 'Invoice_2026-0001.pdf')
})
