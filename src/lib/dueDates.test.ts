import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faelligkeitIso, isOverdue, daysOverdue } from './dueDates.ts'

// Referenz-„heute" für deterministische Tests.
const TODAY = '2026-07-15'

test('faelligkeitIso: gespeichertes due_date gewinnt (eingefroren)', () => {
  // Selbst wenn das Händler-Zahlungsziel abweicht, bleibt due_date maßgeblich.
  assert.equal(
    faelligkeitIso({
      invoice_date: '2026-01-01',
      due_date: '2026-01-20',
      dealer: { zahlungsziel_tage: 90 },
    }),
    '2026-01-20',
  )
})

test('faelligkeitIso: ohne due_date → invoice_date + Händler-Zahlungsziel', () => {
  assert.equal(
    faelligkeitIso({
      invoice_date: '2026-01-01',
      due_date: null,
      dealer: { zahlungsziel_tage: 60 },
    }),
    '2026-03-02',
  )
})

test('faelligkeitIso: ohne due_date und ohne Händler-Ziel → Standard 30 Tage', () => {
  assert.equal(
    faelligkeitIso({ invoice_date: '2026-01-01', due_date: null }),
    '2026-01-31',
  )
})

test('faelligkeitIso: Zahlungsziel 0 bleibt 0 (nicht Standard)', () => {
  assert.equal(
    faelligkeitIso({
      invoice_date: '2026-01-01',
      due_date: null,
      dealer: { zahlungsziel_tage: 0 },
    }),
    '2026-01-01',
  )
})

test('faelligkeitIso: kein Rechnungsdatum → null', () => {
  assert.equal(faelligkeitIso({ invoice_date: null, due_date: null }), null)
})

test('isOverdue: Fälligkeit vor heute ist überfällig, heute selbst nicht', () => {
  assert.equal(
    isOverdue({ invoice_date: null, due_date: '2026-07-14' }, TODAY),
    true,
  )
  assert.equal(
    isOverdue({ invoice_date: null, due_date: TODAY }, TODAY),
    false,
  )
})

test('daysOverdue: Tage seit Fälligkeit, null wenn nicht überfällig', () => {
  assert.equal(
    daysOverdue({ invoice_date: null, due_date: '2026-07-05' }, TODAY),
    10,
  )
  assert.equal(
    daysOverdue({ invoice_date: null, due_date: '2026-07-20' }, TODAY),
    null,
  )
})
