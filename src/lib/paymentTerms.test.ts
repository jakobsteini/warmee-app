import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePaymentTerms,
  parseSkontoPercent,
  parseDecimalField,
  parseIntField,
} from './paymentTerms.ts'

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

// ─── parseSkontoPercent: tolerant, aber nie stiller Datenverlust ─────────────

test('parseSkontoPercent: reine Zahl', () => {
  assert.deepEqual(parseSkontoPercent('2'), { ok: true, value: 2 })
})

test('parseSkontoPercent: mit Prozentzeichen und Leerzeichen', () => {
  assert.deepEqual(parseSkontoPercent('2%'), { ok: true, value: 2 })
  assert.deepEqual(parseSkontoPercent('2 %'), { ok: true, value: 2 })
  assert.deepEqual(parseSkontoPercent('  3% '), { ok: true, value: 3 })
})

test('parseSkontoPercent: Dezimalkomma', () => {
  assert.deepEqual(parseSkontoPercent('2,5'), { ok: true, value: 2.5 })
  assert.deepEqual(parseSkontoPercent('2,5 %'), { ok: true, value: 2.5 })
})

test('parseSkontoPercent: leer → gültig/null (Händler ohne Skonto)', () => {
  assert.deepEqual(parseSkontoPercent(''), { ok: true, value: null })
  assert.deepEqual(parseSkontoPercent('   '), { ok: true, value: null })
})

test('parseSkontoPercent: nicht deutbar → ungültig (kein stilles null)', () => {
  assert.deepEqual(parseSkontoPercent('abc'), { ok: false })
  assert.deepEqual(parseSkontoPercent('2x'), { ok: false })
  assert.deepEqual(parseSkontoPercent('2%3'), { ok: false })
})

// ─── parseIntField: strikt ganzzahlig ────────────────────────────────────────

test('parseIntField: Ziffern (auch mit %-Suffix)', () => {
  assert.deepEqual(parseIntField('7'), { ok: true, value: 7 })
  assert.deepEqual(parseIntField('7 %'), { ok: true, value: 7 })
})

test('parseIntField: leer → null', () => {
  assert.deepEqual(parseIntField(''), { ok: true, value: null })
})

test('parseIntField: nicht-ganzzahlig/Buchstaben → ungültig (kein stilles parseInt)', () => {
  assert.deepEqual(parseIntField('2x'), { ok: false })
  assert.deepEqual(parseIntField('2,5'), { ok: false })
  assert.deepEqual(parseIntField('abc'), { ok: false })
})

// ─── parseDecimalField: Rabatt/Kreditlimit — tolerant, nie stiller Verlust ───

test('parseDecimalField: reine Zahl / Prozent / Leerzeichen / Komma', () => {
  assert.deepEqual(parseDecimalField('10'), { ok: true, value: 10 })
  assert.deepEqual(parseDecimalField('10%'), { ok: true, value: 10 })
  assert.deepEqual(parseDecimalField('10 %'), { ok: true, value: 10 })
  assert.deepEqual(parseDecimalField('10,5'), { ok: true, value: 10.5 })
})

test('parseDecimalField: leer → gültig/null (kein Rabatt / kein Limit)', () => {
  assert.deepEqual(parseDecimalField(''), { ok: true, value: null })
  assert.deepEqual(parseDecimalField('   '), { ok: true, value: null })
})

test('parseDecimalField: nicht deutbar → ungültig (kein stilles null)', () => {
  assert.deepEqual(parseDecimalField('abc'), { ok: false })
  assert.deepEqual(parseDecimalField('10x'), { ok: false })
})
