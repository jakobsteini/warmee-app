import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refundDue, totalRefunds, type RefundInput } from './refundCalc.ts'

// Grundfall: voll bezahlte Rechnung (1000 brutto), danach Retoure über 240.
// Erstattung = der volle Retourenbetrag, weil genau der Rechnungsbetrag gezahlt war.
test('voll bezahlt, dann Retoure → Erstattung = Retourenbetrag', () => {
  assert.equal(refundDue(1000, 240, 1000), 240)
})

// Skonto-Fall (der eigentliche Teilzahlungs-Fall): gezahlt = 970 (3 % Skonto).
// Geminderte Forderung nach Retoure = 1000 − 240 = 760. Überzahlt = 970 − 760 = 210.
// Es wird NICHT der volle Retourenbetrag (240) erstattet — nur der überzahlte Teil.
test('Skonto-Zahlung: erstattet nur den über die geminderte Forderung hinaus gezahlten Teil', () => {
  assert.equal(refundDue(1000, 240, 970), 210)
})

// Skonto-Zahlung, aber kleine Retoure: geminderte Forderung (980) liegt noch über
// dem gezahlten Betrag (970) → keine Erstattung (die Rechnung ist sogar noch −10
// offen, aber das ist kein Refund).
test('Skonto-Zahlung, kleine Retoure → keine Erstattung', () => {
  assert.equal(refundDue(1000, 20, 970), 0)
})

// Unbezahlte Rechnung (paid_amount null): nie eine Erstattung — sie bleibt ein
// Offener Posten und wird dort um die Retoure gemindert (openAfterReturns).
test('unbezahlt (paid_amount null) → nie Erstattung', () => {
  assert.equal(refundDue(1000, 240, null), 0)
  assert.equal(refundDue(1000, 240, undefined), 0)
  assert.equal(refundDue(1000, 240, 0), 0)
})

// Ohne Retoure gibt es nichts zu erstatten, auch wenn exakt bezahlt wurde.
test('keine Retoure → keine Erstattung', () => {
  assert.equal(refundDue(1000, 0, 1000), 0)
})

// Robust gegen numeric-Strings aus der DB (total/paid_amount kommen als string).
test('robust gegen numeric-Strings, auf Cent gerundet', () => {
  assert.equal(refundDue('1000.00', 240, '1000.00'), 240)
  assert.equal(refundDue('100.005', 0, '100.01'), 0.01)
})

// Erstattung nie negativ (Überzahlung ist immer ≥ 0 geklemmt).
test('Erstattung nie negativ', () => {
  assert.equal(refundDue(1000, 0, 500), 0)
})

// Aggregation: je Rechnung einzeln klemmen, DANN summieren. Eine überzahlte
// Rechnung (240) darf nicht gegen eine unterzahlte (0, nicht negativ) aufgerechnet
// werden.
test('totalRefunds: je Rechnung geklemmt, dann summiert', () => {
  const rows: RefundInput[] = [
    { total: 1000, returnsTotal: 240, paidAmount: 1000 }, // 240
    { total: 500, returnsTotal: 100, paidAmount: 300 }, //   0 (300 < 400)
    { total: 800, returnsTotal: 800, paidAmount: 776 }, // 776 (voll retourniert, Skonto gezahlt)
  ]
  assert.equal(totalRefunds(rows), 240 + 0 + 776)
})

test('totalRefunds: leere Liste → 0', () => {
  assert.equal(totalRefunds([]), 0)
})
