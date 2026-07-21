import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  supplierLang,
  supplierOrderRecipients,
  supplierOrderMailText,
  buildMailtoUrl,
} from './supplierOrderMail.ts'

test('supplierLang: nur „de" → de, sonst en (Nepal-Default)', () => {
  assert.equal(supplierLang('de'), 'de')
  assert.equal(supplierLang('en'), 'en')
  assert.equal(supplierLang(null), 'en')
  assert.equal(supplierLang(undefined), 'en')
  assert.equal(supplierLang(''), 'en')
})

test('supplierOrderRecipients: Haupt-Mail vorne + Kontakte, dedupliziert', () => {
  assert.deepEqual(
    supplierOrderRecipients({
      email: 'office@np.com',
      kontakt1_email: 'boss@np.com',
      kontakt2_email: 'office@np.com', // Duplikat der Haupt-Mail
      kontakt3_email: 'kaputt', // ungültig → raus
    }),
    ['office@np.com', 'boss@np.com'],
  )
})

test('supplierOrderRecipients: ungültige Haupt-Mail wird übersprungen', () => {
  assert.deepEqual(
    supplierOrderRecipients({ email: 'keine-mail', kontakt1_email: 'a@np.com' }),
    ['a@np.com'],
  )
})

test('supplierOrderRecipients: gar keine Adresse → leeres Array', () => {
  assert.deepEqual(supplierOrderRecipients({}), [])
})

test('supplierOrderMailText: DE enthält die Bestellnummer', () => {
  const { subject, body } = supplierOrderMailText({
    orderNumber: 'LB-2026-0001',
    lang: 'de',
  })
  assert.equal(subject, 'WARM ME — Bestellung LB-2026-0001')
  assert.ok(body.includes('LB-2026-0001'))
  assert.ok(body.startsWith('Sehr geehrte'))
})

test('supplierOrderMailText: EN enthält die Bestellnummer', () => {
  const { subject, body } = supplierOrderMailText({
    orderNumber: 'LB-2026-0007',
    lang: 'en',
  })
  assert.equal(subject, 'WARM ME — Order LB-2026-0007')
  assert.ok(body.includes('LB-2026-0007'))
  assert.ok(body.startsWith('Dear'))
})

test('buildMailtoUrl: Empfänger komma-getrennt, Betreff/Body kodiert', () => {
  const url = buildMailtoUrl(['a@np.com', 'b@np.com'], 'Order X', 'Zeile 1\nZeile 2')
  assert.ok(url.startsWith('mailto:a@np.com,b@np.com?'))
  assert.ok(url.includes('subject=Order%20X'))
  assert.ok(url.includes('body=Zeile%201%0AZeile%202'))
})

test('buildMailtoUrl: ohne Empfänger bleibt to leer', () => {
  const url = buildMailtoUrl([], 'S', 'B')
  assert.ok(url.startsWith('mailto:?'))
})
