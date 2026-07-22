import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dealerImageMailSubject,
  dealerImageMailBodyHtml,
} from './dealerImageMailPayload.ts'

test('dealerImageMailSubject: DE/EN', () => {
  assert.equal(dealerImageMailSubject('de'), 'WARM ME – Ihr Bildmaterial')
  assert.equal(dealerImageMailSubject('en'), 'WARM ME – Your image material')
})

test('dealerImageMailBodyHtml: DE enthält Link, Anzahl, Gültigkeit', () => {
  const html = dealerImageMailBodyHtml('de', {
    dealerName: 'Absatz',
    downloadUrl: 'https://x.test/zip',
    count: 7,
    expiresDays: 7,
  })
  assert.match(html, /Sehr geehrte\/r Absatz,/)
  assert.match(html, /7 Bilder/)
  assert.match(html, /href="https:\/\/x\.test\/zip"/)
  assert.match(html, /7 Tage gültig/)
})

test('dealerImageMailBodyHtml: EN-Variante', () => {
  const html = dealerImageMailBodyHtml('en', {
    dealerName: 'Absatz',
    downloadUrl: 'https://x.test/zip',
    count: 3,
    expiresDays: 7,
  })
  assert.match(html, /Dear Absatz,/)
  assert.match(html, /3 images/)
  assert.match(html, /valid for 7 days/)
})

test('dealerImageMailBodyHtml: leerer Name → höfliche Anrede', () => {
  const de = dealerImageMailBodyHtml('de', {
    dealerName: '  ',
    downloadUrl: 'https://x.test/zip',
    count: 1,
    expiresDays: 7,
  })
  assert.match(de, /Sehr geehrte Damen und Herren,/)
})

test('dealerImageMailBodyHtml: escaped Name/URL (kein HTML-Inject)', () => {
  const html = dealerImageMailBodyHtml('de', {
    dealerName: '<b>x</b>',
    downloadUrl: 'https://x.test/zip?a=1&b=2',
    count: 1,
    expiresDays: 7,
  })
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/)
  assert.doesNotMatch(html, /<b>x<\/b>/)
  assert.match(html, /a=1&amp;b=2/)
})
