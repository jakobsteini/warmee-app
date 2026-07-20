import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  taxCategory,
  taxRateFor,
  taxNoteFor,
  isPlausibleUid,
  applyVat,
  taxCalc,
  AT_VAT_RATE,
} from './taxCalc.ts'

// Beispiel-OSS-Sätze (wie sie später aus oss_country_rates kämen).
const OSS = { DE: 0.19, FR: 0.2, IT: 0.22, HU: 0.27 }

// ─── isPlausibleUid: Offline-Format, KEIN VIES ──────────────────────────────
test('isPlausibleUid: gültiges AT/DE-Format', () => {
  assert.equal(isPlausibleUid('ATU12345678', 'AT'), true)
  assert.equal(isPlausibleUid('DE123456789', 'DE'), true)
  // Leerzeichen und Kleinschreibung werden normalisiert.
  assert.equal(isPlausibleUid('de 123456789', 'de'), true)
})

test('isPlausibleUid: Griechenland-Ausnahme (ISO2 GR, Präfix EL)', () => {
  assert.equal(isPlausibleUid('EL123456789', 'GR'), true)
  assert.equal(isPlausibleUid('GR123456789', 'GR'), false) // falsches Präfix
})

test('isPlausibleUid: leer / falsches Länder-Präfix / kein Land → false', () => {
  assert.equal(isPlausibleUid('', 'DE'), false)
  assert.equal(isPlausibleUid(null, 'DE'), false)
  assert.equal(isPlausibleUid('FR123456789', 'DE'), false) // Prefix passt nicht zum Land
  assert.equal(isPlausibleUid('DE123456789', ''), false) // Land unbekannt
  assert.equal(isPlausibleUid('DE1', 'DE'), false) // Body zu kurz
})

// ─── taxCategory: alle sechs Kategorien ─────────────────────────────────────
test('taxCategory: b2c_at (Inland-Endkunde)', () => {
  assert.equal(taxCategory({ customer_group: 'b2c', country_iso2: 'AT', uid: null }), 'b2c_at')
})

test('taxCategory: b2c_eu (EU-Ausland-Endkunde)', () => {
  assert.equal(taxCategory({ customer_group: 'b2c', country_iso2: 'DE', uid: null }), 'b2c_eu')
})

test('taxCategory: b2b_at (Inland-Händler, UID egal)', () => {
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'AT', uid: 'ATU12345678' }), 'b2b_at')
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'AT', uid: null }), 'b2b_at')
})

test('taxCategory: b2b_eu_uid (EU-Händler mit gültiger UID → Reverse Charge)', () => {
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'DE', uid: 'DE123456789' }), 'b2b_eu_uid')
})

test('taxCategory: b2b_eu_no_uid (EU-Händler ohne/ungültige UID → regulär 20 %)', () => {
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'DE', uid: '' }), 'b2b_eu_no_uid')
  // Falsches Präfix zählt als nicht gültig → no_uid.
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'DE', uid: 'FR999999999' }), 'b2b_eu_no_uid')
})

test('taxCategory: b2b_third (Drittland-Händler → Ausfuhr)', () => {
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'CH', uid: null }), 'b2b_third')
  assert.equal(taxCategory({ customer_group: 'b2b', country_iso2: 'US', uid: null }), 'b2b_third')
})

// ─── taxRateFor: Sätze je Kategorie ─────────────────────────────────────────
test('taxRateFor: 20 % bei b2c_at / b2b_at / b2b_eu_no_uid', () => {
  assert.deepEqual(taxRateFor('b2c_at', 'AT', OSS), { rate: 0.2, ossMissing: false })
  assert.deepEqual(taxRateFor('b2b_at', 'AT', OSS), { rate: 0.2, ossMissing: false })
  assert.deepEqual(taxRateFor('b2b_eu_no_uid', 'DE', OSS), { rate: 0.2, ossMissing: false })
})

test('taxRateFor: 0 % bei Reverse Charge / Ausfuhr', () => {
  assert.deepEqual(taxRateFor('b2b_eu_uid', 'DE', OSS), { rate: 0, ossMissing: false })
  assert.deepEqual(taxRateFor('b2b_third', 'CH', OSS), { rate: 0, ossMissing: false })
})

test('taxRateFor: b2c_eu nimmt den landesspezifischen OSS-Satz', () => {
  assert.deepEqual(taxRateFor('b2c_eu', 'DE', OSS), { rate: 0.19, ossMissing: false })
  assert.deepEqual(taxRateFor('b2c_eu', 'HU', OSS), { rate: 0.27, ossMissing: false })
})

// KRITISCH: b2c_eu ohne hinterlegten OSS-Satz → NICHT still 0 %.
test('taxRateFor: b2c_eu OHNE OSS-Satz → Fallback 20 % + ossMissing (NIE still 0 %)', () => {
  const r = taxRateFor('b2c_eu', 'PL', OSS) // PL nicht in OSS
  assert.equal(r.rate, AT_VAT_RATE)
  assert.equal(r.rate !== 0, true)
  assert.equal(r.ossMissing, true)
})

// ─── taxNoteFor: Pflichthinweise DE/EN ──────────────────────────────────────
test('taxNoteFor: Reverse Charge trägt zweisprachigen Hinweis', () => {
  const n = taxNoteFor('b2b_eu_uid')
  assert.ok(n)
  assert.match(n.de, /innergemeinschaftliche Lieferung/)
  assert.match(n.en, /intra-Community supply/)
})

test('taxNoteFor: Ausfuhr trägt zweisprachigen Hinweis', () => {
  const n = taxNoteFor('b2b_third')
  assert.ok(n)
  assert.match(n.de, /Ausfuhrlieferung/)
  assert.match(n.en, /export delivery/)
})

test('taxNoteFor: alle übrigen Kategorien → null (kein Pflichthinweis)', () => {
  assert.equal(taxNoteFor('b2c_at'), null)
  assert.equal(taxNoteFor('b2c_eu'), null)
  assert.equal(taxNoteFor('b2b_at'), null)
  assert.equal(taxNoteFor('b2b_eu_no_uid'), null)
})

// ─── applyVat: rate-parametrisiert, Cent-genau ──────────────────────────────
test('applyVat: 20 % / 0 % / OSS-Satz, kaufmännisch gerundet', () => {
  assert.deepEqual(applyVat(100, 0.2), { net: 100, vat: 20, gross: 120 })
  assert.deepEqual(applyVat(100, 0), { net: 100, vat: 0, gross: 100 })
  // 99,99 × 19 % = 18,9981 → 19,00; brutto 118,99.
  assert.deepEqual(applyVat(99.99, 0.19), { net: 99.99, vat: 19, gross: 118.99 })
})

// ─── Grenzfälle: B2C-Drittland / unbekanntes Land → review, NIE still 0 % ───
test('taxCalc: B2C-Drittland → b2c_at-Fallback (20 %) + review (nicht im Modell)', () => {
  const r = taxCalc({ customer_group: 'b2c', country_iso2: 'CH', uid: null }, OSS)
  assert.equal(r.category, 'b2c_at')
  assert.equal(r.rate, 0.2)
  assert.equal(r.review, true)
  assert.equal(r.note, null)
})

test('taxCalc: unbekanntes/leeres Land bei B2B → b2b_at (20 %) + review', () => {
  const r = taxCalc({ customer_group: 'b2b', country_iso2: '', uid: null }, OSS)
  assert.equal(r.category, 'b2b_at')
  assert.equal(r.rate, 0.2)
  assert.equal(r.review, true)
})

// ─── taxCalc: End-to-End je Hauptfall ───────────────────────────────────────
test('taxCalc: b2b_eu_uid → 0 % + Reverse-Charge-Hinweis, kein review/ossMissing', () => {
  const r = taxCalc({ customer_group: 'b2b', country_iso2: 'DE', uid: 'DE123456789' }, OSS)
  assert.equal(r.category, 'b2b_eu_uid')
  assert.equal(r.rate, 0)
  assert.ok(r.note && /innergemeinschaftliche/.test(r.note.de))
  assert.equal(r.ossMissing, false)
  assert.equal(r.review, false)
})

test('taxCalc: b2c_eu mit OSS-Satz → landesspezifisch, keine Flags', () => {
  const r = taxCalc({ customer_group: 'b2c', country_iso2: 'IT', uid: null }, OSS)
  assert.equal(r.category, 'b2c_eu')
  assert.equal(r.rate, 0.22)
  assert.equal(r.ossMissing, false)
  assert.equal(r.review, false)
  assert.equal(r.note, null)
})
