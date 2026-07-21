import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pdfLang,
  invoicePdfLabels,
  deliveryNotePdfLabels,
} from './pdfLabels.ts'

test('pdfLang: nur „en" → en, alles andere → de (Fallback)', () => {
  assert.equal(pdfLang('en'), 'en')
  assert.equal(pdfLang('de'), 'de')
  assert.equal(pdfLang(null), 'de')
  assert.equal(pdfLang(undefined), 'de')
  assert.equal(pdfLang(''), 'de')
  assert.equal(pdfLang('fr'), 'de')
})

test('invoicePdfLabels: DE- und EN-Tabelle haben exakt dieselben Keys', () => {
  const de = invoicePdfLabels('de')
  const en = invoicePdfLabels('en')
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort())
})

test('deliveryNotePdfLabels: DE- und EN-Tabelle haben exakt dieselben Keys', () => {
  const de = deliveryNotePdfLabels('de')
  const en = deliveryNotePdfLabels('en')
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort())
})

test('invoicePdfLabels: deutsche Titel/Labels unverändert (Bestandsschutz)', () => {
  const de = invoicePdfLabels('de')
  assert.equal(de.title, 'Rechnung')
  assert.equal(de.recipient, 'Rechnungsempfänger')
  assert.equal(de.subtotal, 'Nettobetrag')
  assert.equal(de.vat, 'USt')
  assert.equal(de.gross, 'Gesamtbetrag (brutto)')
})

test('invoicePdfLabels: englische Titel/Labels', () => {
  const en = invoicePdfLabels('en')
  assert.equal(en.title, 'Invoice')
  assert.equal(en.recipient, 'Invoice recipient')
  assert.equal(en.subtotal, 'Net amount')
  assert.equal(en.vat, 'VAT')
  assert.equal(en.gross, 'Total (gross)')
})

test('deliveryNotePdfLabels: Titel + Empfänger je Sprache', () => {
  assert.equal(deliveryNotePdfLabels('de').title, 'Lieferschein')
  assert.equal(deliveryNotePdfLabels('de').recipient, 'Empfänger')
  assert.equal(deliveryNotePdfLabels('en').title, 'Delivery note')
  assert.equal(deliveryNotePdfLabels('en').recipient, 'Recipient')
})

test('payableWithin: mit und ohne Fälligkeitsdatum, DE', () => {
  const de = invoicePdfLabels('de')
  assert.equal(
    de.payableWithin(30, '20.08.2026'),
    'Zahlbar innerhalb von 30 Tagen netto. Fällig am 20.08.2026.',
  )
  assert.equal(de.payableWithin(30, null), 'Zahlbar innerhalb von 30 Tagen netto.')
})

test('payableWithin: mit und ohne Fälligkeitsdatum, EN', () => {
  const en = invoicePdfLabels('en')
  assert.equal(
    en.payableWithin(30, '20.08.2026'),
    'Payable within 30 days net. Due on 20.08.2026.',
  )
  assert.equal(en.payableWithin(30, null), 'Payable within 30 days net.')
})

test('skontoLine: eingesetzte (bereits formatierte) Werte, DE', () => {
  const de = invoicePdfLabels('de')
  assert.equal(
    de.skontoLine('31.07.2026', '3', '52,20 €', '1.687,80 €'),
    'Bei Zahlung bis 31.07.2026: 3 % Skonto = 52,20 € — Zahlbetrag 1.687,80 €.',
  )
})

test('skontoLine: eingesetzte Werte, EN', () => {
  const en = invoicePdfLabels('en')
  assert.equal(
    en.skontoLine('31.07.2026', '3', '52,20 €', '1.687,80 €'),
    'On payment by 31.07.2026: 3 % cash discount = 52,20 € — amount payable 1.687,80 €.',
  )
})
