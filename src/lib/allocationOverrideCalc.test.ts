import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allocationSum,
  allocationRemaining,
  allocationOverBy,
  isWithinCapacity,
} from './allocationOverrideCalc.ts'

const lines = (...qs: number[]) => qs.map((quantity) => ({ quantity }))

test('allocationSum: Summe der Mengen', () => {
  assert.equal(allocationSum(lines(3, 2, 5)), 10)
  assert.equal(allocationSum([]), 0)
})

test('allocationRemaining: positiv (Untermenge), 0 (exakt), negativ (über)', () => {
  assert.equal(allocationRemaining(10, lines(3, 2)), 5) // noch 5 offen
  assert.equal(allocationRemaining(10, lines(6, 4)), 0) // exakt
  assert.equal(allocationRemaining(10, lines(8, 5)), -3) // 3 zu viel
})

test('allocationOverBy: Überschreitungsmenge, sonst 0', () => {
  assert.equal(allocationOverBy(10, lines(8, 5)), 3)
  assert.equal(allocationOverBy(10, lines(4, 4)), 0)
  assert.equal(allocationOverBy(10, lines(10)), 0)
})

test('isWithinCapacity: harte Grenze — Überschreitung verboten', () => {
  assert.equal(isWithinCapacity(10, lines(6, 4)), true) // exakt ok
  assert.equal(isWithinCapacity(10, lines(6, 5)), false) // 11 > 10
})

test('isWithinCapacity: Untermenge erlaubt', () => {
  assert.equal(isWithinCapacity(10, lines(2, 3)), true) // 5 < 10 ok
  assert.equal(isWithinCapacity(10, []), true)
})

test('isWithinCapacity: negative Einzelmenge ungültig', () => {
  assert.equal(isWithinCapacity(10, lines(-1, 3)), false)
})
