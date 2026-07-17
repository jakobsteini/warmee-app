import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVat,
  computeSkonto,
  effectivePaymentTerms,
  skontoPayment,
} from './tax.ts'

test('applyVat: 20 % USt, auf Cent gerundet', () => {
  assert.deepEqual(applyVat(1740), { net: 1740, tax: 348, gross: 2088 })
})

test('applyVat: Rundung', () => {
  assert.deepEqual(applyVat(99.99), { net: 99.99, tax: 20, gross: 119.99 })
})

test('effectivePaymentTerms: null → WARM-ME-Standard', () => {
  assert.deepEqual(effectivePaymentTerms(null), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('effectivePaymentTerms: Händlerwert überschreibt pro Feld', () => {
  assert.deepEqual(effectivePaymentTerms({ zahlungsziel_tage: 60 }), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 60,
  })
})

test('effectivePaymentTerms: explizit 0 % bleibt 0 (kein Standard-Skonto)', () => {
  assert.deepEqual(
    effectivePaymentTerms({
      skonto_prozent: 0,
      skonto_tage: 0,
      zahlungsziel_tage: 30,
    }),
    { skonto_prozent: 0, skonto_tage: 0, zahlungsziel_tage: 30 },
  )
})

test('effectivePaymentTerms: numeric-String aus der DB wird zu Zahl', () => {
  assert.deepEqual(
    effectivePaymentTerms({ skonto_prozent: '4.00', zahlungsziel_tage: 45 }),
    { skonto_prozent: 4, skonto_tage: 10, zahlungsziel_tage: 45 },
  )
})

test('computeSkonto: 3 % auf 2088,00 € brutto', () => {
  assert.deepEqual(computeSkonto(2088, 3), {
    prozent: 3,
    amount: 62.64,
    payable: 2025.36,
  })
})

test('computeSkonto: Rundung auf Cent', () => {
  assert.deepEqual(computeSkonto(99.99, 3), {
    prozent: 3,
    amount: 3,
    payable: 96.99,
  })
})

// ─── skontoPayment: Vorschau für den „Zahlung erfassen"-Dialog ───────────────

test('skontoPayment: innerhalb der Frist → Rest − Skonto', () => {
  // Basis = offener Rest 1000, 3 % Skonto, 10 Tage, Rechnung 2026-07-01.
  const r = skontoPayment(1000, 3, 10, '2026-07-01', '2026-07-05')
  assert.deepEqual(r, {
    applicable: true,
    deadline: '2026-07-11',
    prozent: 3,
    amount: 30,
    payable: 970,
  })
})

test('skontoPayment: Frist-Tag selbst zählt noch als fristgerecht', () => {
  const r = skontoPayment(1000, 3, 10, '2026-07-01', '2026-07-11')
  assert.equal(r.applicable, true)
  assert.equal(r.payable, 970)
})

test('skontoPayment: nach der Frist → voller Rest, kein Abzug', () => {
  const r = skontoPayment(1000, 3, 10, '2026-07-01', '2026-07-12')
  assert.deepEqual(r, {
    applicable: false,
    deadline: '2026-07-11',
    prozent: 3,
    amount: 0,
    payable: 1000,
  })
})

test('skontoPayment: 0 % Skonto → nie anwendbar, voller Rest', () => {
  const r = skontoPayment(1000, 0, 10, '2026-07-01', '2026-07-02')
  assert.equal(r.applicable, false)
  assert.equal(r.amount, 0)
  assert.equal(r.payable, 1000)
})

test('skontoPayment: Basis ist der offene Rest (nach Retouren), auf Cent', () => {
  // Teilretoure → offener Rest 811,80; 3 % → 24,354 → 24,35 Abzug.
  const r = skontoPayment(811.8, 3, 10, '2026-07-01', '2026-07-03')
  assert.equal(r.amount, 24.35)
  assert.equal(r.payable, 787.45)
})
