import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyInvoiceTermOverrides } from './paymentTerms.ts'

const defaults = {
  zahlungsziel_tage: 30,
  skonto_prozent: 2,
  skonto_tage: 10,
  freitext: 'Standardbedingung',
}

test('applyInvoiceTermOverrides: ohne Overrides → unveränderte Standards', () => {
  assert.deepEqual(applyInvoiceTermOverrides(defaults), defaults)
  assert.deepEqual(applyInvoiceTermOverrides(defaults, undefined), defaults)
})

test('applyInvoiceTermOverrides: einzelnes Feld überschreiben, Rest bleibt', () => {
  assert.deepEqual(applyInvoiceTermOverrides(defaults, { zahlungsziel_tage: 14 }), {
    ...defaults,
    zahlungsziel_tage: 14,
  })
})

test('applyInvoiceTermOverrides: 0 ist gültig (kein Skonto, sofort fällig)', () => {
  assert.deepEqual(
    applyInvoiceTermOverrides(defaults, { skonto_prozent: 0, zahlungsziel_tage: 0 }),
    { ...defaults, skonto_prozent: 0, zahlungsziel_tage: 0 },
  )
})

test('applyInvoiceTermOverrides: Freitext leer/whitespace → null; nicht gesetzt → Standard', () => {
  assert.equal(
    applyInvoiceTermOverrides(defaults, { zahlungsbedingung_freitext: '   ' }).freitext,
    null,
  )
  assert.equal(
    applyInvoiceTermOverrides(defaults, { skonto_tage: 7 }).freitext,
    'Standardbedingung',
  )
  assert.equal(
    applyInvoiceTermOverrides(defaults, { zahlungsbedingung_freitext: 'Netto 14' }).freitext,
    'Netto 14',
  )
})
