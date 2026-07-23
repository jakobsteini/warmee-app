import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, waMeLink } from './phoneNormalize.ts'

test('normalizePhone: 00-Präfix (echte AT/DE-Formate)', () => {
  assert.equal(normalizePhone('0043 662 84 23 950', 'A (EU)'), '+436628423950')
  assert.equal(normalizePhone('0049 - 521 - 179127', 'D (EU)'), '+49521179127')
})

test('normalizePhone: bereits +', () => {
  assert.equal(normalizePhone('+49 4018087065', 'D (EU)'), '+494018087065')
  assert.equal(normalizePhone('+43 5264 5212-0', 'A (EU)'), '+43526452120')
})

test('normalizePhone: nationale 0-Nummer nur mit Land', () => {
  assert.equal(normalizePhone('0650 2144214', 'A (EU)'), '+436502144214')
  assert.equal(normalizePhone('0650 2144214', null), null) // Land unbekannt → block
  assert.equal(normalizePhone('0650 2144214', 'USA'), null) // kein AT/DE/CH → block
})

test('normalizePhone: mehrdeutig ohne 0/+/00 → null (block-statt-raten)', () => {
  assert.equal(normalizePhone('662 84 23 950', 'A (EU)'), null)
})

test('normalizePhone: leer/zu kurz/zu lang → null', () => {
  assert.equal(normalizePhone('', 'AT'), null)
  assert.equal(normalizePhone('   ', 'AT'), null)
  assert.equal(normalizePhone('+49 123', 'DE'), null) // 5 Ziffern
  assert.equal(normalizePhone('+49 1234567890123456', 'DE'), null) // 17 Ziffern
})

test('waMeLink: Nummer ohne +, Text encoded', () => {
  assert.equal(
    waMeLink('+436628423950', 'Hallo & Grüße'),
    'https://wa.me/436628423950?text=Hallo%20%26%20Gr%C3%BC%C3%9Fe',
  )
  assert.equal(waMeLink(null, 'x'), null)
})
