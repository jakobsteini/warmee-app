import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineKm,
  rankByDistance,
  withinRadius,
  normCountry,
  resolveDealerPoint,
  formatDistance,
  telHref,
  mapsRouteUrl,
} from './geoDistance.ts'

// Reale Koordinaten (aus dem PLZ-Seed, GeoNames-Zentroide).
const WIEN = { lat: 48.2085, lng: 16.3721 } // 1010
const SALZBURG = { lat: 47.7994, lng: 13.044 } // 5020
const MUENCHEN = { lat: 48.1345, lng: 11.571 } // 80331
const GRAZ = { lat: 47.08153, lng: 15.47178 } // 8010

test('haversineKm: Wien–Salzburg ≈ 250 km', () => {
  const d = haversineKm(WIEN, SALZBURG)
  assert.ok(d > 245 && d < 255, `erwartet ~250, war ${d.toFixed(1)}`)
})

test('haversineKm: Wien–München ≈ 355 km', () => {
  const d = haversineKm(WIEN, MUENCHEN)
  assert.ok(d > 350 && d < 360, `erwartet ~355, war ${d.toFixed(1)}`)
})

test('haversineKm: Wien–Graz ≈ 145 km', () => {
  const d = haversineKm(WIEN, GRAZ)
  assert.ok(d > 140 && d < 152, `erwartet ~145, war ${d.toFixed(1)}`)
})

test('haversineKm: gleicher Punkt = 0', () => {
  assert.equal(haversineKm(WIEN, WIEN), 0)
})

test('rankByDistance: aufsteigend, ohne Koordinate ans Ende', () => {
  const ranked = rankByDistance(WIEN, [
    { item: 'München', coord: MUENCHEN },
    { item: 'ohnePLZ', coord: null },
    { item: 'Graz', coord: GRAZ },
    { item: 'Salzburg', coord: SALZBURG },
  ])
  assert.deepEqual(
    ranked.map((r) => r.item),
    ['Graz', 'Salzburg', 'München', 'ohnePLZ'],
  )
  assert.equal(ranked[3].distanceKm, null)
})

test('withinRadius: filtert korrekt, null bleibt draußen', () => {
  const ranked = rankByDistance(WIEN, [
    { item: 'Graz', coord: GRAZ }, // ~145
    { item: 'Salzburg', coord: SALZBURG }, // ~250
    { item: 'ohnePLZ', coord: null },
  ])
  assert.deepEqual(
    withinRadius(ranked, 150).map((r) => r.item),
    ['Graz'],
  )
  assert.deepEqual(
    withinRadius(ranked, 300).map((r) => r.item),
    ['Graz', 'Salzburg'],
  )
})

test('normCountry: reale unsaubere Codes → AT/DE/CH bzw. null', () => {
  const cases: [string, 'AT' | 'DE' | 'CH' | null][] = [
    ['A (EU)', 'AT'],
    ['AT', 'AT'],
    ['D (EU)', 'DE'],
    ['DE (EU)', 'DE'],
    ['CH', 'CH'],
    ['I (EU)', null],
    ['USA', null],
    ['NOR', null],
    ['SE (EU)', null],
    ['UK', null],
    ['', null],
  ]
  for (const [raw, expected] of cases) {
    assert.equal(normCountry(raw), expected, `${raw} → ${expected}`)
  }
})

// ─── Standort-Umkreissuche: Fallback, Formatierung, Links ────────────────────

const WIEN_1010 = { lat: 48.2085, lng: 16.3721 } // PLZ-Zentroid Wien
const LADEN = { lat: 48.19412, lng: 16.35674 } // echte Adresse (Beispiel 4. Bezirk)

test('resolveDealerPoint: echte Koordinate schlaegt Zentroid, approximate=false', () => {
  const p = resolveDealerPoint(LADEN, WIEN_1010)
  assert.deepEqual(p, { coord: LADEN, approximate: false })
})

test('resolveDealerPoint: ohne echte Koordinate → Zentroid, approximate=true', () => {
  const p = resolveDealerPoint(null, WIEN_1010)
  assert.deepEqual(p, { coord: WIEN_1010, approximate: true })
})

test('resolveDealerPoint: weder noch → null (kein Raten)', () => {
  assert.equal(resolveDealerPoint(null, null), null)
})

test('Sortierung mischt exakte und ungefaehre nach echter Entfernung', () => {
  // Ein naher Haendler nur mit Zentroid muss vor einem fernen exakten stehen.
  const nahZentroid = resolveDealerPoint(null, { lat: 48.21, lng: 16.37 })!
  const fernExakt = resolveDealerPoint({ lat: 47.8, lng: 13.04 }, null)! // Salzburg
  const ranked = rankByDistance(WIEN_1010, [
    { item: { name: 'fern-exakt', approximate: fernExakt.approximate }, coord: fernExakt.coord },
    { item: { name: 'nah-zentroid', approximate: nahZentroid.approximate }, coord: nahZentroid.coord },
  ])
  assert.deepEqual(
    ranked.map((r) => r.item.name),
    ['nah-zentroid', 'fern-exakt'],
  )
  // Der ungefaehre Treffer behaelt sein Flag durch das Ranking.
  assert.equal(ranked[0].item.approximate, true)
  assert.equal(ranked[1].item.approximate, false)
})

test('formatDistance: unter 1 km → Meter (auf 10 gerundet)', () => {
  assert.equal(formatDistance(0.45), '450 m')
  assert.equal(formatDistance(0.123), '120 m')
  assert.equal(formatDistance(0), '0 m')
  assert.equal(formatDistance(-5), '0 m') // negativ wie 0
})

test('formatDistance: 1–10 km → eine Nachkommastelle mit Komma, glatt ohne ,0', () => {
  assert.equal(formatDistance(3.24), '3,2 km')
  assert.equal(formatDistance(3.25), '3,3 km')
  assert.equal(formatDistance(5), '5 km')
  assert.equal(formatDistance(1), '1 km')
})

test('formatDistance: ab 10 km → ganze Kilometer', () => {
  assert.equal(formatDistance(24.4), '24 km')
  assert.equal(formatDistance(145.6), '146 km')
})

test('telHref: normalisierte Nummer → tel:, ohne Nummer null', () => {
  assert.equal(telHref('+4366412345678'), 'tel:+4366412345678')
  assert.equal(telHref(null), null)
})

test('mapsRouteUrl: Routen-Link aus Koordinate', () => {
  assert.equal(
    mapsRouteUrl({ lat: 48.19412, lng: 16.35674 }),
    'https://www.google.com/maps/dir/?api=1&destination=48.19412,16.35674',
  )
})
