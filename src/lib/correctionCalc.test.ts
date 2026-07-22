import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correctionTotals } from './correctionCalc.ts'

test('correctionTotals: positive Retouren-Summen → Minusbeträge', () => {
  assert.deepEqual(correctionTotals(100, 20, 120), {
    net: -100,
    tax: -20,
    gross: -120,
  })
})

test('correctionTotals: string-Eingaben (numeric) werden geparst', () => {
  assert.deepEqual(correctionTotals('99.50', '19.90', '119.40'), {
    net: -99.5,
    tax: -19.9,
    gross: -119.4,
  })
})

test('correctionTotals: 0 bleibt 0 (kein „-0"-Vorzeichenproblem im Betrag)', () => {
  const r = correctionTotals(0, 0, 0)
  assert.equal(r.net, 0)
  assert.equal(r.gross, 0)
})
