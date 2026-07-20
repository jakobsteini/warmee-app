import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterOrders } from './orderListFilter.ts'

const rows = [
  { id: 'a', season_id: 's1', dealer_id: 'd1', assignment: 'agent' },
  { id: 'b', season_id: 's1', dealer_id: 'd2', assignment: 'internal' },
  { id: 'c', season_id: 's2', dealer_id: 'd1', assignment: 'agent' },
]

const ids = (r: { id: string }[]) => r.map((x) => x.id)

test('filterOrders: kein Filter → alle', () => {
  assert.deepEqual(ids(filterOrders(rows, {})), ['a', 'b', 'c'])
})

test('filterOrders: nach Saison', () => {
  assert.deepEqual(ids(filterOrders(rows, { seasonId: 's1' })), ['a', 'b'])
})

test('filterOrders: nach Kunde', () => {
  assert.deepEqual(ids(filterOrders(rows, { dealerId: 'd1' })), ['a', 'c'])
})

test('filterOrders: nach Zuordnung (assignment)', () => {
  assert.deepEqual(ids(filterOrders(rows, { assignment: 'agent' })), ['a', 'c'])
})

test('filterOrders: UND-Verknüpfung mehrerer Achsen', () => {
  assert.deepEqual(
    ids(filterOrders(rows, { seasonId: 's1', assignment: 'agent' })),
    ['a'],
  )
})

test('filterOrders: leerer String zählt als kein Filter', () => {
  assert.deepEqual(ids(filterOrders(rows, { seasonId: '', dealerId: '' })), [
    'a',
    'b',
    'c',
  ])
})
