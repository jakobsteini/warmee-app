import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  currentStock,
  currentStockForWarehouse,
  currentStockAcrossWarehouses,
  proposeDeliveryDischarge,
  type MovementLike,
} from './inventoryCalc.ts'

/** Kurzschreibweise für eine Bewegung; Standard: Bestandslager, ohne Variante. */
function mv(menge: number, o: Partial<MovementLike> = {}): MovementLike {
  return {
    product_id: o.product_id ?? 'P',
    variant_id: o.variant_id ?? null,
    color: o.color ?? null,
    size: o.size ?? null,
    warehouse: o.warehouse ?? 'bestand',
    menge,
  }
}

// ─── currentStock ───────────────────────────────────────────────────────────

test('currentStock summiert vorzeichenbehaftet je Dimension', () => {
  const lines = currentStock([mv(10), mv(-3), mv(-2)])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].bestand, 5) // 10 − 3 − 2
})

test('kein Clamp: mehr Abgang als Zugang ergibt negativen Bestand', () => {
  const lines = currentStock([mv(2), mv(-5)])
  assert.equal(lines[0].bestand, -3)
})

test('getrennte Lager sind getrennte Bestandszeilen', () => {
  const lines = currentStock([
    mv(5, { warehouse: 'bestand' }),
    mv(4, { warehouse: 'online' }),
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines.find((l) => l.warehouse === 'bestand')?.bestand, 5)
  assert.equal(lines.find((l) => l.warehouse === 'online')?.bestand, 4)
})

test('Variante trennt den Bestand (shaded ≠ ohne Variante)', () => {
  const lines = currentStock([
    mv(3, { variant_id: 'V' }),
    mv(7, { variant_id: null }),
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines.find((l) => l.variant_id === 'V')?.bestand, 3)
  assert.equal(lines.find((l) => l.variant_id === null)?.bestand, 7)
})

test('color/size trennen den Bestand', () => {
  const lines = currentStock([
    mv(3, { color: 'camel', size: 'M' }),
    mv(4, { color: 'camel', size: 'L' }),
    mv(5, { color: 'ecru', size: 'M' }),
  ])
  assert.equal(lines.length, 3)
})

test('Netto-Bestand 0 bleibt als Zeile erhalten (kein Filter im Kern)', () => {
  const lines = currentStock([mv(4), mv(-4)])
  assert.equal(lines.length, 1)
  assert.equal(lines[0].bestand, 0)
})

// ─── je Lager / über beide Lager ─────────────────────────────────────────────

test('currentStockForWarehouse filtert auf ein Lager', () => {
  const movements = [
    mv(5, { warehouse: 'bestand' }),
    mv(4, { warehouse: 'online' }),
  ]
  const only = currentStockForWarehouse(movements, 'online')
  assert.equal(only.length, 1)
  assert.equal(only[0].warehouse, 'online')
  assert.equal(only[0].bestand, 4)
})

test('currentStockAcrossWarehouses summiert über beide Lager', () => {
  const lines = currentStockAcrossWarehouses([
    mv(5, { warehouse: 'bestand' }),
    mv(4, { warehouse: 'online' }),
  ])
  assert.equal(lines.length, 1) // warehouse kollabiert
  assert.equal(lines[0].bestand, 9)
})

test('across warehouses trennt weiter nach Variante', () => {
  const lines = currentStockAcrossWarehouses([
    mv(5, { warehouse: 'bestand', variant_id: 'V' }),
    mv(4, { warehouse: 'online', variant_id: 'V' }),
    mv(2, { warehouse: 'online', variant_id: null }),
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines.find((l) => l.variant_id === 'V')?.bestand, 9)
  assert.equal(lines.find((l) => l.variant_id === null)?.bestand, 2)
})

// ─── proposeDeliveryDischarge ────────────────────────────────────────────────

test('Ausbuchungs-Vorschlag: negative Menge, variant null, Lager/Grund/Lieferschein gesetzt', () => {
  const drafts = proposeDeliveryDischarge(
    'D1',
    [{ product_id: 'P', color: 'camel', size: 'M', quantity: 5 }],
    'bestand',
  )
  assert.equal(drafts.length, 1)
  const d = drafts[0]
  assert.equal(d.menge, -5) // Abgang negativ
  assert.equal(d.variant_id, null) // Automatik rät nie eine Variante
  assert.equal(d.warehouse, 'bestand')
  assert.equal(d.grund, 'lieferschein')
  assert.equal(d.delivery_id, 'D1')
  assert.equal(d.product_id, 'P')
  assert.equal(d.color, 'camel')
  assert.equal(d.size, 'M')
})

test('Vorschlag summiert doppelte Positionen zu einer Bewegung', () => {
  const drafts = proposeDeliveryDischarge(
    'D1',
    [
      { product_id: 'P', color: 'camel', size: 'M', quantity: 3 },
      { product_id: 'P', color: 'camel', size: 'M', quantity: 2 },
    ],
    'online',
  )
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].menge, -5)
})

test('Vorschlag ignoriert Nullmengen', () => {
  const drafts = proposeDeliveryDischarge(
    'D1',
    [
      { product_id: 'P', color: null, size: null, quantity: 0 },
      { product_id: 'Q', color: null, size: null, quantity: 4 },
    ],
    'bestand',
  )
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].product_id, 'Q')
  assert.equal(drafts[0].menge, -4)
})

test('Vorschlag trennt verschiedene Positionen', () => {
  const drafts = proposeDeliveryDischarge(
    'D1',
    [
      { product_id: 'P', color: 'camel', size: 'M', quantity: 2 },
      { product_id: 'P', color: 'ecru', size: 'M', quantity: 3 },
    ],
    'bestand',
  )
  assert.equal(drafts.length, 2)
})
