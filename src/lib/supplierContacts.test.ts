import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidEmail,
  collectSupplierEmails,
  firstInvalidContactEmail,
} from './supplierContacts.ts'

// ─── isValidEmail ────────────────────────────────────────────────────────────

test('isValidEmail: typische gültige Adressen', () => {
  assert.equal(isValidEmail('a@b.co'), true)
  assert.equal(isValidEmail('anita@shangri-la.com.np'), true)
  assert.equal(isValidEmail('  raj@red-street.np  '), true) // wird getrimmt
})

test('isValidEmail: ungültige Adressen (Tippfehler abfangen)', () => {
  assert.equal(isValidEmail(''), false)
  assert.equal(isValidEmail('   '), false)
  assert.equal(isValidEmail('no-at'), false)
  assert.equal(isValidEmail('a@b'), false) // kein Punkt im Domainteil
  assert.equal(isValidEmail('a @b.com'), false) // Leerraum
  assert.equal(isValidEmail('a@b .com'), false)
  assert.equal(isValidEmail('a@@b.com'), false)
  assert.equal(isValidEmail('@b.com'), false)
  assert.equal(isValidEmail('a@.com'), false)
})

// ─── collectSupplierEmails ───────────────────────────────────────────────────

test('collectSupplierEmails: 0 gültige → leeres Array', () => {
  assert.deepEqual(collectSupplierEmails({}), [])
  assert.deepEqual(
    collectSupplierEmails({
      kontakt1_email: null,
      kontakt2_email: '',
      kontakt3_email: '   ',
    }),
    [],
  )
})

test('collectSupplierEmails: 1 gültige', () => {
  assert.deepEqual(
    collectSupplierEmails({ kontakt2_email: 'anita@shangri-la.np' }),
    ['anita@shangri-la.np'],
  )
})

test('collectSupplierEmails: 2 gültige, stabile Reihenfolge (1 vor 3)', () => {
  assert.deepEqual(
    collectSupplierEmails({
      kontakt1_email: 'boss@np.com',
      kontakt3_email: 'raj@np.com',
    }),
    ['boss@np.com', 'raj@np.com'],
  )
})

test('collectSupplierEmails: 3 gültige in Reihenfolge 1→2→3', () => {
  assert.deepEqual(
    collectSupplierEmails({
      kontakt1_email: 'a@np.com',
      kontakt2_email: 'b@np.com',
      kontakt3_email: 'c@np.com',
    }),
    ['a@np.com', 'b@np.com', 'c@np.com'],
  )
})

test('collectSupplierEmails: ungültige werden gefiltert, gültige bleiben', () => {
  assert.deepEqual(
    collectSupplierEmails({
      kontakt1_email: 'gut@np.com',
      kontakt2_email: 'kaputt', // ungültig → raus
      kontakt3_email: 'auch-gut@np.com',
    }),
    ['gut@np.com', 'auch-gut@np.com'],
  )
})

test('collectSupplierEmails: Duplikate (nach Trim) entfallen', () => {
  assert.deepEqual(
    collectSupplierEmails({
      kontakt1_email: 'a@np.com',
      kontakt2_email: '  a@np.com  ',
      kontakt3_email: 'b@np.com',
    }),
    ['a@np.com', 'b@np.com'],
  )
})

// ─── firstInvalidContactEmail ────────────────────────────────────────────────

test('firstInvalidContactEmail: alles leer → null (Bestandslieferant ok)', () => {
  assert.equal(firstInvalidContactEmail({}), null)
  assert.equal(
    firstInvalidContactEmail({ kontakt1_email: '', kontakt2_email: null }),
    null,
  )
})

test('firstInvalidContactEmail: nur gültige → null', () => {
  assert.equal(
    firstInvalidContactEmail({
      kontakt1_email: 'a@np.com',
      kontakt3_email: 'b@np.com',
    }),
    null,
  )
})

test('firstInvalidContactEmail: gibt die erste kaputte Zeile zurück', () => {
  assert.equal(
    firstInvalidContactEmail({
      kontakt1_email: 'a@np.com',
      kontakt2_email: 'kaputt',
      kontakt3_email: 'auch-kaputt',
    }),
    2,
  )
})

test('firstInvalidContactEmail: Name ohne E-Mail ist erlaubt (nur E-Mail zählt)', () => {
  // Kontakt 1 hätte nur einen Namen — hier egal, da E-Mail leer ist → null.
  assert.equal(firstInvalidContactEmail({ kontakt1_email: '' }), null)
})
