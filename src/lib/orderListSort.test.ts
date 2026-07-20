import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortOrders } from './orderListSort.ts'

const mk = (
  id: string,
  dealer: string | null,
  season: string | null,
  assignment: string,
  from: string | null,
) => ({
  id,
  assignment,
  delivery_date_from: from,
  season: season ? { label: season } : null,
  dealer: dealer ? { name: dealer } : null,
})

const ids = (r: { id: string }[]) => r.map((x) => x.id)

test('sortOrders: nach Kundenname asc/desc', () => {
  const rows = [
    mk('a', 'Zeta', 'FW26', 'agent', null),
    mk('b', 'Alpha', 'FW26', 'agent', null),
    mk('c', 'Mitte', 'FW26', 'agent', null),
  ]
  assert.deepEqual(ids(sortOrders(rows, 'dealer', 'asc')), ['b', 'c', 'a'])
  assert.deepEqual(ids(sortOrders(rows, 'dealer', 'desc')), ['a', 'c', 'b'])
})

test('sortOrders: nach Saison', () => {
  const rows = [
    mk('a', 'X', 'SS27', 'agent', null),
    mk('b', 'X', 'FW26', 'agent', null),
  ]
  assert.deepEqual(ids(sortOrders(rows, 'season', 'asc')), ['b', 'a'])
})

test('sortOrders: nach Lieferdatum-Von, leere IMMER am Ende (asc + desc)', () => {
  const rows = [
    mk('a', 'X', 'FW26', 'agent', '2026-03-01'),
    mk('b', 'X', 'FW26', 'agent', null),
    mk('c', 'X', 'FW26', 'agent', '2026-01-15'),
  ]
  // asc: c (Jan), a (Mär), dann b (leer)
  assert.deepEqual(ids(sortOrders(rows, 'delivery_from', 'asc')), ['c', 'a', 'b'])
  // desc: a (Mär), c (Jan), dann b (leer) — leer NICHT vorn
  assert.deepEqual(ids(sortOrders(rows, 'delivery_from', 'desc')), ['a', 'c', 'b'])
})

test('sortOrders: nach Zuordnung', () => {
  const rows = [
    mk('a', 'X', 'FW26', 'internal', null),
    mk('b', 'X', 'FW26', 'agent', null),
  ]
  assert.deepEqual(ids(sortOrders(rows, 'assignment', 'asc')), ['b', 'a'])
})

test('sortOrders: mutiert die Eingabe nicht', () => {
  const rows = [
    mk('a', 'Zeta', 'FW26', 'agent', null),
    mk('b', 'Alpha', 'FW26', 'agent', null),
  ]
  const before = ids(rows)
  sortOrders(rows, 'dealer', 'asc')
  assert.deepEqual(ids(rows), before)
})
