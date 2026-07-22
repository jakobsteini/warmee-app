import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePaymentTerms,
  parseSkontoPercent,
  parseDecimalField,
  parseIntField,
  buildPaymentTermsText,
  validateOrderPaymentTerms,
  resolveInvoicePaymentTerms,
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

// ─── buildPaymentTermsText ───────────────────────────────────────────────────

test('buildPaymentTermsText: mit Skonto + Brutto, DE (Betrag korrekt gerundet)', () => {
  // 2 % von 617,00 = 12,34 (auf Cent gerundet).
  const txt = buildPaymentTermsText({
    zahlungszielTage: 30,
    skontoProzent: 2,
    skontoTage: 10,
    freitext: null,
    sprache: 'de',
    bruttoBetrag: 617,
  })
  assert.equal(
    txt,
    'Zahlbar innerhalb 30 Tagen netto. Bei Zahlung innerhalb 10 Tagen 2 % Skonto (EUR 12,34).',
  )
})

test('buildPaymentTermsText: mit Skonto + Brutto, EN', () => {
  const txt = buildPaymentTermsText({
    zahlungszielTage: 30,
    skontoProzent: 2,
    skontoTage: 10,
    freitext: null,
    sprache: 'en',
    bruttoBetrag: 617,
  })
  assert.equal(
    txt,
    'Payable within 30 days net. On payment within 10 days 2 % cash discount (EUR 12,34).',
  )
})

test('buildPaymentTermsText: Rundung + Tausenderpunkt (2,5 % von 50.000)', () => {
  const txt = buildPaymentTermsText({
    zahlungszielTage: 14,
    skontoProzent: 2.5,
    skontoTage: 7,
    freitext: null,
    sprache: 'de',
    bruttoBetrag: 50000,
  })
  // 2,5 % von 50.000 = 1.250,00
  assert.equal(
    txt,
    'Zahlbar innerhalb 14 Tagen netto. Bei Zahlung innerhalb 7 Tagen 2,5 % Skonto (EUR 1.250,00).',
  )
})

test('buildPaymentTermsText: ohne Brutto → Skonto ohne Betrag', () => {
  const txt = buildPaymentTermsText({
    zahlungszielTage: 30,
    skontoProzent: 3,
    skontoTage: 10,
    freitext: null,
    sprache: 'de',
    bruttoBetrag: null,
  })
  assert.equal(
    txt,
    'Zahlbar innerhalb 30 Tagen netto. Bei Zahlung innerhalb 10 Tagen 3 % Skonto.',
  )
})

test('buildPaymentTermsText: ohne Skonto → nur Zahlungsziel-Satz (DE/EN)', () => {
  const base = {
    zahlungszielTage: 30,
    skontoProzent: null,
    skontoTage: null,
    freitext: null,
    bruttoBetrag: 500,
  }
  assert.equal(
    buildPaymentTermsText({ ...base, sprache: 'de' }),
    'Zahlbar innerhalb 30 Tagen netto.',
  )
  assert.equal(
    buildPaymentTermsText({ ...base, sprache: 'en' }),
    'Payable within 30 days net.',
  )
})

test('buildPaymentTermsText: 0 Tage → sofort fällig', () => {
  assert.equal(
    buildPaymentTermsText({
      zahlungszielTage: 0,
      skontoProzent: null,
      skontoTage: null,
      freitext: null,
      sprache: 'de',
    }),
    'Zahlbar sofort netto.',
  )
})

test('buildPaymentTermsText: Freitext als eigene Zeile angehängt', () => {
  const txt = buildPaymentTermsText({
    zahlungszielTage: 30,
    skontoProzent: null,
    skontoTage: null,
    freitext: '  Zahlung per Vorkasse vereinbart.  ',
    sprache: 'de',
  })
  assert.equal(
    txt,
    'Zahlbar innerhalb 30 Tagen netto.\nZahlung per Vorkasse vereinbart.',
  )
})

// ─── validateOrderPaymentTerms ───────────────────────────────────────────────

test('validateOrderPaymentTerms: leeres Zahlungsziel → Default 30, kein Skonto', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '',
      skonto_prozent: '',
      skonto_tage: '',
    }),
    { ok: true, value: { zahlungsziel_tage: 30, skonto_prozent: null, skonto_tage: null } },
  )
})

test('validateOrderPaymentTerms: vollständiges Skonto gültig', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '30',
      skonto_prozent: '2,5',
      skonto_tage: '10',
    }),
    { ok: true, value: { zahlungsziel_tage: 30, skonto_prozent: 2.5, skonto_tage: 10 } },
  )
})

test('validateOrderPaymentTerms: Skonto-Prozent > 100 → Fehler', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '30',
      skonto_prozent: '120',
      skonto_tage: '10',
    }),
    { ok: false, error: 'order.payment.err.skontoRange' },
  )
})

test('validateOrderPaymentTerms: skonto_tage > zahlungsziel → Fehler', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '10',
      skonto_prozent: '3',
      skonto_tage: '20',
    }),
    { ok: false, error: 'order.payment.err.skontoTageVsZiel' },
  )
})

test('validateOrderPaymentTerms: nur Prozent ohne Tage → unvollständig', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '30',
      skonto_prozent: '3',
      skonto_tage: '',
    }),
    { ok: false, error: 'order.payment.err.skontoIncomplete' },
  )
})

test('validateOrderPaymentTerms: nur Tage ohne Prozent → unvollständig', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '30',
      skonto_prozent: '',
      skonto_tage: '10',
    }),
    { ok: false, error: 'order.payment.err.skontoIncomplete' },
  )
})

test('validateOrderPaymentTerms: Zahlungsziel nicht deutbar → Fehler (kein stilles 30)', () => {
  assert.deepEqual(
    validateOrderPaymentTerms({
      zahlungsziel_tage: '30x',
      skonto_prozent: '',
      skonto_tage: '',
    }),
    { ok: false, error: 'order.payment.err.zielInvalid' },
  )
})

// ─── resolveInvoicePaymentTerms (Order→Rechnung-Link, Session 2) ─────────────

const DEALER_EFFECTIVE = { zahlungsziel_tage: 30, skonto_prozent: 3, skonto_tage: 10 }

test('resolveInvoicePaymentTerms: mit Order → Order gewinnt (inkl. Freitext)', () => {
  assert.deepEqual(
    resolveInvoicePaymentTerms(
      { zahlungsziel_tage: 14, skonto_prozent: 2, skonto_tage: 7, freitext: 'Vorkasse' },
      DEALER_EFFECTIVE,
    ),
    { zahlungsziel_tage: 14, skonto_prozent: 2, skonto_tage: 7, freitext: 'Vorkasse' },
  )
})

test('resolveInvoicePaymentTerms: Order OHNE Skonto → 0/0 (NICHT auf Standard auffüllen)', () => {
  assert.deepEqual(
    resolveInvoicePaymentTerms(
      { zahlungsziel_tage: 30, skonto_prozent: null, skonto_tage: null, freitext: null },
      DEALER_EFFECTIVE,
    ),
    { zahlungsziel_tage: 30, skonto_prozent: 0, skonto_tage: 0, freitext: null },
  )
})

test('resolveInvoicePaymentTerms: Freitext wird getrimmt, leer → null', () => {
  const r = resolveInvoicePaymentTerms(
    { zahlungsziel_tage: 30, skonto_prozent: null, skonto_tage: null, freitext: '   ' },
    DEALER_EFFECTIVE,
  )
  assert.equal(r.freitext, null)
})

test('resolveInvoicePaymentTerms: ohne Order (Altbeleg/frei) → Händlerkonditionen, kein Freitext', () => {
  assert.deepEqual(resolveInvoicePaymentTerms(null, DEALER_EFFECTIVE), {
    zahlungsziel_tage: 30,
    skonto_prozent: 3,
    skonto_tage: 10,
    freitext: null,
  })
})
