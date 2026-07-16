import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastConfiguredLevel, canHandOver } from './dunningCollectionsCalc.ts'
import type { DunningLevel } from '../types/dunning.ts'

/** Baut eine Mahnstufe (nur die für die Logik relevanten Felder zählen). */
function level(level_number: number, triggers_collection = false): DunningLevel {
  return {
    id: `L${level_number}`,
    org_id: 'O',
    level_number,
    label: `Stufe ${level_number}`,
    days_after_due: level_number * 15,
    fee: 0,
    triggers_collection,
    created_at: null,
    updated_at: null,
  }
}

const LEVELS = [level(1), level(2), level(3, true)]

test('lastConfiguredLevel: höchste Stufennummer, reihenfolgeunabhängig', () => {
  assert.equal(lastConfiguredLevel(LEVELS)?.level_number, 3)
  assert.equal(lastConfiguredLevel([level(3, true), level(1)])?.level_number, 3)
  assert.equal(lastConfiguredLevel([]), null)
})

test('canHandOver: erst ab der letzten Stufe', () => {
  assert.equal(canHandOver(level(3, true), LEVELS, false), true)
  assert.equal(canHandOver(level(2), LEVELS, false), false) // nicht letzte Stufe
  assert.equal(canHandOver(null, LEVELS, false), false) // keine Stufe erreicht
})

test('canHandOver: nicht bei bereits aktivem Inkasso-Fall', () => {
  assert.equal(canHandOver(level(3, true), LEVELS, true), false)
})

test('canHandOver: ohne konfigurierte Stufen nie', () => {
  assert.equal(canHandOver(null, [], false), false)
})
