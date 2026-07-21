import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allocateByPriority,
  totalDemand,
  type AllocationClaim,
} from './supplierAllocationCalc.ts'

function claim(p: Partial<AllocationClaim> & { orderId: string }): AllocationClaim {
  return {
    orderId: p.orderId,
    dealerId: p.dealerId ?? p.orderId + '-d',
    dealerName: p.dealerName ?? p.orderId,
    priorityFlag: p.priorityFlag ?? false,
    seasonPriority: 'seasonPriority' in p ? (p.seasonPriority ?? null) : null,
    demand: p.demand ?? 1,
  }
}

const alloc = (r: ReturnType<typeof allocateByPriority>) =>
  Object.fromEntries(r.map((x) => [x.orderId, x.allocated]))

test('volle Kapazität → jeder bekommt seinen Bedarf', () => {
  const claims = [claim({ orderId: 'a', demand: 3 }), claim({ orderId: 'b', demand: 4 })]
  assert.deepEqual(alloc(allocateByPriority(claims, 7, 1)), { a: 3, b: 4 })
})

test('Kapazität 0 → alle 0', () => {
  const claims = [claim({ orderId: 'a', demand: 3 }), claim({ orderId: 'b', demand: 4 })]
  assert.deepEqual(alloc(allocateByPriority(claims, 0, 1)), { a: 0, b: 0 })
})

test('Prioritäts-Häkchen wird zuerst voll bedient', () => {
  const claims = [
    claim({ orderId: 'normal', priorityFlag: false, demand: 5 }),
    claim({ orderId: 'prio', priorityFlag: true, demand: 5 }),
  ]
  // Nur 5 Stück → das Häkchen (prio) bekommt alles, normal geht leer aus.
  assert.deepEqual(alloc(allocateByPriority(claims, 5, 42)), { prio: 5, normal: 0 })
})

test('dealer_season_priority: kleinere Zahl zuerst', () => {
  const claims = [
    claim({ orderId: 'p2', seasonPriority: 2, demand: 5 }),
    claim({ orderId: 'p1', seasonPriority: 1, demand: 5 }),
  ]
  assert.deepEqual(alloc(allocateByPriority(claims, 5, 42)), { p1: 5, p2: 0 })
})

test('fehlende season_priority landet hinter jedem Eintrag', () => {
  const claims = [
    claim({ orderId: 'none', seasonPriority: null, demand: 5 }),
    claim({ orderId: 'p9', seasonPriority: 9, demand: 5 }),
  ]
  assert.deepEqual(alloc(allocateByPriority(claims, 5, 42)), { p9: 5, none: 0 })
})

test('Häkchen schlägt bessere season_priority', () => {
  const claims = [
    claim({ orderId: 'flag', priorityFlag: true, seasonPriority: 9, demand: 5 }),
    claim({ orderId: 'noflag', priorityFlag: false, seasonPriority: 1, demand: 5 }),
  ]
  assert.deepEqual(alloc(allocateByPriority(claims, 5, 42)), { flag: 5, noflag: 0 })
})

test('Gleichstand → geseedter Zufall, reproduzierbar bei gleichem Seed', () => {
  const claims = [
    claim({ orderId: 'a', demand: 1 }),
    claim({ orderId: 'b', demand: 1 }),
  ]
  const r1 = alloc(allocateByPriority(claims, 1, 12345))
  const r2 = alloc(allocateByPriority(claims, 1, 12345))
  assert.deepEqual(r1, r2) // deterministisch
  // Genau einer bekommt das eine Stück.
  assert.equal(r1.a + r1.b, 1)
})

test('Gleichstand: Ergebnis unabhängig von der Eingabereihenfolge', () => {
  const a = claim({ orderId: 'a', demand: 1 })
  const b = claim({ orderId: 'b', demand: 1 })
  assert.deepEqual(
    alloc(allocateByPriority([a, b], 1, 999)),
    alloc(allocateByPriority([b, a], 1, 999)),
  )
})

test('Teilkapazität: Summe = min(capacity, Gesamtbedarf)', () => {
  const claims = [
    claim({ orderId: 'a', demand: 4 }),
    claim({ orderId: 'b', demand: 4 }),
    claim({ orderId: 'c', demand: 4 }),
  ]
  const r = allocateByPriority(claims, 7, 5)
  const sum = r.reduce((s, x) => s + x.allocated, 0)
  assert.equal(sum, 7)
  assert.equal(totalDemand(claims), 12)
})

test('negative Kapazität wird wie 0 behandelt', () => {
  const claims = [claim({ orderId: 'a', demand: 3 })]
  assert.deepEqual(alloc(allocateByPriority(claims, -5, 1)), { a: 0 })
})

// (Der Order→Lieferung-Split wird in deliverySplit.test.ts geprüft.)
