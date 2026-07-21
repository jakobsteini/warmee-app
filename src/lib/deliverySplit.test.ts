import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitByOrder, type SplitRow } from './deliverySplit.ts'

function row(p: Partial<SplitRow> & { orderId: string | null }): SplitRow {
  return {
    orderId: p.orderId,
    dealerId: 'dealerId' in p ? (p.dealerId ?? null) : 'd1',
    productId: p.productId ?? 'A',
    color: p.color ?? null,
    size: p.size ?? null,
    quantity: p.quantity ?? 1,
  }
}

/** Bequemer Zugriff auf ein ok-Ergebnis. */
function ok(res: ReturnType<typeof splitByOrder>) {
  assert.equal(res.ok, true)
  if (!res.ok) throw new Error('unerwartet')
  return res.deliveries
}

test('splitByOrder: je Order eine Lieferung, Händler mitgeführt', () => {
  const res = ok(
    splitByOrder([
      row({ orderId: 'o1', dealerId: 'd1', quantity: 3 }),
      row({ orderId: 'o2', dealerId: 'd2', quantity: 4 }),
    ]),
  )
  assert.equal(res.length, 2)
  assert.equal(res[0].orderId, 'o1')
  assert.equal(res[0].dealerId, 'd1')
  assert.equal(res[0].positions.get('A||||')?.total, 3)
  assert.equal(res[1].positions.get('A||||')?.total, 4)
})

test('splitByOrder: zwei Orders DESSELBEN Händlers bleiben getrennt (Kern des Splits)', () => {
  const res = ok(
    splitByOrder([
      row({ orderId: 'o1', dealerId: 'd1', quantity: 3 }),
      row({ orderId: 'o2', dealerId: 'd1', quantity: 2 }),
    ]),
  )
  assert.equal(res.length, 2)
  assert.equal(res[0].positions.get('A||||')?.total, 3)
  assert.equal(res[1].positions.get('A||||')?.total, 2)
})

test('splitByOrder: Positionen derselben Order werden summiert', () => {
  const res = ok(
    splitByOrder([
      row({ orderId: 'o1', quantity: 3 }),
      row({ orderId: 'o1', quantity: 2 }),
    ]),
  )
  assert.equal(res.length, 1)
  assert.equal(res[0].positions.get('A||||')?.total, 5)
})

test('splitByOrder: verschiedene Positionen je Order getrennt', () => {
  const res = ok(
    splitByOrder([
      row({ orderId: 'o1', color: 'rot', quantity: 2 }),
      row({ orderId: 'o1', color: 'blau', quantity: 5 }),
    ]),
  )
  assert.equal(res[0].positions.get('A||rot||')?.total, 2)
  assert.equal(res[0].positions.get('A||blau||')?.total, 5)
})

test('splitByOrder: 0-Mengen erzeugen keine Lieferzeile', () => {
  const res = ok(
    splitByOrder([
      row({ orderId: 'o1', quantity: 0 }),
      row({ orderId: 'o1', quantity: 4 }),
    ]),
  )
  assert.equal(res[0].positions.get('A||||')?.total, 4)
  assert.equal(res[0].positions.size, 1)
})

test('splitByOrder: 0-Menge ohne Order ist KEIN Hard-Block (übersprungen)', () => {
  const res = splitByOrder([
    row({ orderId: null, dealerId: null, quantity: 0 }),
    row({ orderId: 'o1', quantity: 3 }),
  ])
  assert.equal(res.ok, true)
})

test('HARD-BLOCK: Position mit Menge > 0 ohne Order → ok:false', () => {
  const res = splitByOrder([
    row({ orderId: 'o1', quantity: 3 }),
    row({ orderId: null, quantity: 2 }),
  ])
  assert.deepEqual(res, { ok: false, unresolved: 1 })
})

test('HARD-BLOCK: Position mit Menge > 0 ohne Händler → ok:false', () => {
  const res = splitByOrder([row({ orderId: 'o1', dealerId: null, quantity: 5 })])
  assert.deepEqual(res, { ok: false, unresolved: 1 })
})

test('splitByOrder: leere Eingabe → ok mit leerer Lieferliste', () => {
  assert.deepEqual(splitByOrder([]), { ok: true, deliveries: [] })
})
