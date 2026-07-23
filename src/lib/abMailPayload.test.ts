import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abMailSubject, abMailBodyHtml } from './abMailPayload.ts'

test('abMailSubject: DE/EN mit Nummer', () => {
  assert.equal(abMailSubject('de', { orderNumber: 'AB-2026-0001' }), 'WARM ME – Auftragsbestätigung AB-2026-0001')
  assert.equal(abMailSubject('en', { orderNumber: 'AB-2026-0001' }), 'WARM ME – Order confirmation AB-2026-0001')
})

test('abMailBodyHtml: DE enthält Anrede + Nummer', () => {
  const html = abMailBodyHtml('de', { dealerName: 'Absatz', orderNumber: 'AB-2026-0001' })
  assert.match(html, /Sehr geehrte\/r Absatz,/)
  assert.match(html, /Auftragsbestätigung AB-2026-0001/)
})

test('abMailBodyHtml: EN-Variante', () => {
  const html = abMailBodyHtml('en', { dealerName: 'Absatz', orderNumber: 'AB-2026-0001' })
  assert.match(html, /Dear Absatz,/)
  assert.match(html, /order confirmation AB-2026-0001/)
})

test('abMailBodyHtml: leerer Name → höfliche Anrede', () => {
  const de = abMailBodyHtml('de', { dealerName: '  ', orderNumber: 'X' })
  assert.match(de, /Sehr geehrte Damen und Herren,/)
})

test('abMailBodyHtml: escaped Name (kein HTML-Inject)', () => {
  const html = abMailBodyHtml('de', { dealerName: '<b>x</b>', orderNumber: 'X' })
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/)
  assert.doesNotMatch(html, /<b>x<\/b>/)
})
