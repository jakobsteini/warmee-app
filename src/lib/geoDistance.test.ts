import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineKm,
  rankByDistance,
  withinRadius,
  normCountry,
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
