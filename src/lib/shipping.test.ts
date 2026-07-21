import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shippingDisplay,
  validateShipping,
  normalizeShippingFreitext,
} from './shipping.ts'

// ─── validateShipping (block-statt-raten) ────────────────────────────────────

test('validateShipping: „sonstige" ohne Freitext → Fehler', () => {
  assert.deepEqual(validateShipping({ method: 'sonstige', freitext: '' }), {
    ok: false,
    error: 'order.ship.err.freitextRequired',
  })
  assert.deepEqual(validateShipping({ method: 'sonstige', freitext: '   ' }), {
    ok: false,
    error: 'order.ship.err.freitextRequired',
  })
})

test('validateShipping: „sonstige" mit Freitext → ok', () => {
  assert.deepEqual(
    validateShipping({ method: 'sonstige', freitext: 'Selbstabholung' }),
    { ok: true },
  )
})

test('validateShipping: DPD/DSV/leer → immer ok (Freitext egal)', () => {
  assert.deepEqual(validateShipping({ method: 'dpd', freitext: '' }), { ok: true })
  assert.deepEqual(validateShipping({ method: 'dsv', freitext: 'Rest' }), { ok: true })
  assert.deepEqual(validateShipping({ method: '', freitext: '' }), { ok: true })
})

// ─── normalizeShippingFreitext (kein widersprüchlicher Zustand) ──────────────

test('normalizeShippingFreitext: DPD/DSV → Freitext wird verworfen (null)', () => {
  assert.equal(normalizeShippingFreitext('dpd', 'alter Rest'), null)
  assert.equal(normalizeShippingFreitext('dsv', 'alter Rest'), null)
  assert.equal(normalizeShippingFreitext('', 'alter Rest'), null)
})

test('normalizeShippingFreitext: „sonstige" → getrimmter Freitext (leer → null)', () => {
  assert.equal(normalizeShippingFreitext('sonstige', '  Selbstabholung  '), 'Selbstabholung')
  assert.equal(normalizeShippingFreitext('sonstige', '   '), null)
})

// ─── shippingDisplay (Anzeige-Text, DE/EN) ───────────────────────────────────

test('shippingDisplay: DPD/DSV sind sprachneutral', () => {
  assert.equal(shippingDisplay('dpd', null, 'de'), 'DPD')
  assert.equal(shippingDisplay('dpd', null, 'en'), 'DPD')
  assert.equal(shippingDisplay('dsv', null, 'de'), 'DSV')
  assert.equal(shippingDisplay('dsv', null, 'en'), 'DSV')
})

test('shippingDisplay: „sonstige" zeigt den Freitext (beide Sprachen)', () => {
  assert.equal(shippingDisplay('sonstige', 'Selbstabholung', 'de'), 'Selbstabholung')
  assert.equal(shippingDisplay('sonstige', 'Pickup', 'en'), 'Pickup')
})

test('shippingDisplay: „sonstige" ohne Freitext → lokalisierter Fallback', () => {
  assert.equal(shippingDisplay('sonstige', '', 'de'), 'Sonstige')
  assert.equal(shippingDisplay('sonstige', null, 'en'), 'Other')
})

test('shippingDisplay: keine Versandart → null (keine Zeile)', () => {
  assert.equal(shippingDisplay(null, null, 'de'), null)
  assert.equal(shippingDisplay('', 'egal', 'en'), null)
})

test('shippingDisplay: unbekannter Altwert wird unverändert gezeigt', () => {
  assert.equal(shippingDisplay('gls', null, 'de'), 'gls')
})
