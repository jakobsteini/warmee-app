import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  seasonChronoKey,
  computeFollowUpDealers,
  followUpLang,
  followUpMessage,
  type SeasonRef,
  type DealerSeasonRevenue,
} from './nachfassCalc.ts'

test('seasonChronoKey: SS/FW + Jahr, sonst null', () => {
  assert.equal(seasonChronoKey('FW25'), 255)
  assert.equal(seasonChronoKey('FW26'), 265)
  assert.equal(seasonChronoKey('SS27'), 270)
  assert.equal(seasonChronoKey('ss27'), 270) // case-insensitiv
  assert.ok((seasonChronoKey('FW25') as number) < (seasonChronoKey('SS27') as number))
  assert.equal(seasonChronoKey('FW2025'), null) // nur 2-stelliges Jahr
  assert.equal(seasonChronoKey('Sonderedition'), null)
  assert.equal(seasonChronoKey(null), null)
})

const seasons: SeasonRef[] = [
  { id: 'fw25', code: 'FW25', label: 'Fall/Winter 2025' },
  { id: 'fw26', code: 'FW26', label: 'FW26' },
  { id: 'ss27', code: 'SS27', label: 'SS27' },
]

test('computeFollowUpDealers: Bestandskunden ohne Order in Zielsaison', () => {
  const orders: DealerSeasonRevenue[] = [
    { dealerId: 'A', seasonId: 'fw25', revenue: 100 },
    { dealerId: 'B', seasonId: 'fw26', revenue: 200 },
    { dealerId: 'C', seasonId: 'ss27', revenue: 50 }, // hat Zielsaison → raus
    { dealerId: 'D', seasonId: 'fw25', revenue: 999 },
    { dealerId: 'D', seasonId: 'fw26', revenue: 10 }, // letzte = FW26, Umsatz 10
  ]
  const rows = computeFollowUpDealers(seasons, 'ss27', orders)
  // Sortiert nach Umsatz der LETZTEN Saison absteigend: B(200), A(100), D(10)
  assert.deepEqual(
    rows.map((r) => [r.dealerId, r.lastSeasonLabel, r.lastRevenue]),
    [
      ['B', 'FW26', 200],
      ['A', 'Fall/Winter 2025', 100],
      ['D', 'FW26', 10],
    ],
  )
})

test('computeFollowUpDealers: nur Order in Zielsaison → nicht in Liste', () => {
  const rows = computeFollowUpDealers(seasons, 'ss27', [
    { dealerId: 'X', seasonId: 'ss27', revenue: 5 },
  ])
  assert.equal(rows.length, 0)
})

test('computeFollowUpDealers: keine frühere Order (nur spätere) → nicht in Liste', () => {
  // Ziel FW25; X hat nur SS27 (später) → kein Bestandskunde für FW25.
  const rows = computeFollowUpDealers(seasons, 'fw25', [
    { dealerId: 'X', seasonId: 'ss27', revenue: 5 },
  ])
  assert.equal(rows.length, 0)
})

test('followUpLang + followUpMessage: DE/EN mit Name', () => {
  assert.equal(followUpLang('en'), 'en')
  assert.equal(followUpLang(null), 'de')
  const de = followUpMessage('de', { dealerName: 'Absatz', seasonLabel: 'SS27' })
  assert.match(de, /Hallo Absatz, hier ist WARM ME/)
  const en = followUpMessage('en', { dealerName: 'Absatz', seasonLabel: 'SS27' })
  assert.match(en, /Hello Absatz, this is WARM ME/)
})
