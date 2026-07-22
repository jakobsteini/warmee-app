import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDefectReturn } from './defectReturnCalc.ts'

test('validateDefectReturn: Produkt + Menge → ok', () => {
  assert.deepEqual(
    validateDefectReturn({ product_id: 'p1', article_text: null, quantity: 2 }),
    { ok: true, errorKey: null },
  )
})

test('validateDefectReturn: nur Freitext-Artikel genügt', () => {
  assert.equal(
    validateDefectReturn({ product_id: null, article_text: 'Schal Sand', quantity: 1 }).ok,
    true,
  )
})

test('validateDefectReturn: ohne Artikel → Fehler', () => {
  assert.deepEqual(
    validateDefectReturn({ product_id: null, article_text: '   ', quantity: 1 }),
    { ok: false, errorKey: 'defectReturns.errorArticle' },
  )
})

test('validateDefectReturn: Menge < 1 oder nicht ganzzahlig → Fehler', () => {
  assert.equal(
    validateDefectReturn({ product_id: 'p1', article_text: null, quantity: 0 }).errorKey,
    'defectReturns.errorQuantity',
  )
  assert.equal(
    validateDefectReturn({ product_id: 'p1', article_text: null, quantity: 1.5 }).errorKey,
    'defectReturns.errorQuantity',
  )
})
