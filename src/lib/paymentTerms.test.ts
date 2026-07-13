import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePaymentTerms } from './paymentTerms.ts'

test('Standard-Fall: Skonto + Netto', () => {
  assert.deepEqual(parsePaymentTerms('3%10T N30T'), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('Dezimal-Komma im Skontosatz', () => {
  assert.deepEqual(parsePaymentTerms('4,00%10T N30T'), {
    skonto_prozent: 4,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('abweichende Zahlen', () => {
  assert.deepEqual(parsePaymentTerms('6,00%10T N60T'), {
    skonto_prozent: 6,
    skonto_tage: 10,
    zahlungsziel_tage: 60,
  })
})

test('nur netto → kein Skonto', () => {
  assert.deepEqual(parsePaymentTerms('N30T'), {
    skonto_prozent: 0,
    skonto_tage: 0,
    zahlungsziel_tage: 30,
  })
})

test('nur netto, andere Frist', () => {
  assert.deepEqual(parsePaymentTerms('N90T'), {
    skonto_prozent: 0,
    skonto_tage: 0,
    zahlungsziel_tage: 90,
  })
})

test('explizit 0 % Skonto bleibt 0 (wird nicht durch Standard ersetzt)', () => {
  assert.deepEqual(parsePaymentTerms('0,00%10T N15T'), {
    skonto_prozent: 0,
    skonto_tage: 10,
    zahlungsziel_tage: 15,
  })
})

test('Netto sofort → sofort fällig, kein Skonto', () => {
  assert.deepEqual(parsePaymentTerms('Netto sofort'), {
    skonto_prozent: 0,
    skonto_tage: 0,
    zahlungsziel_tage: 0,
  })
})

test('Groß-/Kleinschreibung egal', () => {
  assert.deepEqual(parsePaymentTerms('n15t'), {
    skonto_prozent: 0,
    skonto_tage: 0,
    zahlungsziel_tage: 15,
  })
})

test('zusätzliche Leerzeichen werden toleriert', () => {
  assert.deepEqual(parsePaymentTerms('  3 % 10 T   N 30 T '), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('leerer String → WARM-ME-Standard', () => {
  assert.deepEqual(parsePaymentTerms(''), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('nur Whitespace → Standard', () => {
  assert.deepEqual(parsePaymentTerms('   '), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('null → Standard', () => {
  assert.deepEqual(parsePaymentTerms(null), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})

test('undefined → Standard', () => {
  assert.deepEqual(parsePaymentTerms(undefined), {
    skonto_prozent: 3,
    skonto_tage: 10,
    zahlungsziel_tage: 30,
  })
})
