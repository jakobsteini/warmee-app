import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeGroupName,
  validateGroupName,
  groupInUse,
  groupArticleCounts,
} from './articleGroups.ts'

// ─── validateGroupName ───────────────────────────────────────────────────────

test('validateGroupName: leerer/whitespace Name → Fehler', () => {
  assert.deepEqual(validateGroupName('', []), {
    ok: false,
    error: 'articleGroups.err.nameEmpty',
  })
  assert.deepEqual(validateGroupName('   ', []), {
    ok: false,
    error: 'articleGroups.err.nameEmpty',
  })
})

test('validateGroupName: gültiger Name → getrimmt zurück', () => {
  assert.deepEqual(validateGroupName('  Mützen  ', []), {
    ok: true,
    value: 'Mützen',
  })
})

test('validateGroupName: Duplikat (case-insensitiv, getrimmt) → Fehler', () => {
  assert.deepEqual(validateGroupName('Mützen', ['Schals', 'Mützen']), {
    ok: false,
    error: 'articleGroups.err.nameDuplicate',
  })
  assert.deepEqual(validateGroupName('  mützen ', ['Mützen']), {
    ok: false,
    error: 'articleGroups.err.nameDuplicate',
  })
})

test('validateGroupName: ähnlicher, aber anderer Name → ok', () => {
  assert.deepEqual(validateGroupName('Mütze', ['Mützen']), {
    ok: true,
    value: 'Mütze',
  })
})

test('normalizeGroupName: nur trimmen, Groß/Klein bleibt', () => {
  assert.equal(normalizeGroupName('  Cardigan '), 'Cardigan')
})

// ─── groupInUse ──────────────────────────────────────────────────────────────

test('groupInUse: Gruppe mit Artikel → true, ohne → false', () => {
  const products = [{ group_id: 'g1' }, { group_id: null }, { group_id: 'g2' }]
  assert.equal(groupInUse('g1', products), true)
  assert.equal(groupInUse('g2', products), true)
  assert.equal(groupInUse('g3', products), false)
  assert.equal(groupInUse('g1', []), false)
})

// ─── groupArticleCounts ──────────────────────────────────────────────────────

test('groupArticleCounts: Zählung je Gruppe + ohne Gruppe, Reihenfolge stabil', () => {
  const groups = [
    { id: 'g1', name: 'Mützen' },
    { id: 'g2', name: 'Schals' },
    { id: 'g3', name: 'leer' },
  ]
  const products = [
    { group_id: 'g1' },
    { group_id: 'g1' },
    { group_id: 'g2' },
    { group_id: null },
    { group_id: null },
  ]
  assert.deepEqual(groupArticleCounts(products, groups), {
    counts: [
      { id: 'g1', name: 'Mützen', count: 2 },
      { id: 'g2', name: 'Schals', count: 1 },
      { id: 'g3', name: 'leer', count: 0 },
    ],
    ungrouped: 2,
  })
})

test('groupArticleCounts: keine Artikel → alle 0, ungrouped 0', () => {
  assert.deepEqual(
    groupArticleCounts([], [{ id: 'g1', name: 'Mützen' }]),
    { counts: [{ id: 'g1', name: 'Mützen', count: 0 }], ungrouped: 0 },
  )
})
