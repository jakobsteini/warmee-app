import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agentGetsCommission,
  computeCommissionOverview,
  type CommissionData,
} from './commissionCalc.ts'

const SEASON = { id: 'S1', label: 'SS27', is_active: true }

/** Baut CommissionData für EINE Saison (S1), Lieferung DEL→S1 vorverdrahtet. */
function data(
  orders: CommissionData['orders'],
  paidInvoices: CommissionData['paidInvoices'],
): CommissionData {
  return {
    orders,
    deliverySeason: new Map([['DEL', 'S1']]),
    paidInvoices,
  }
}

/** Bestätigte Order-Zeile. */
function order(dealer: string, assignment: 'agent' | 'internal') {
  return { dealer_id: dealer, season_id: 'S1', assignment, status: 'confirmed' }
}

/** Bezahlte Rechnung, über DEL an Saison S1 gebunden. */
function paid(dealer: string, amount: number | string) {
  return {
    dealer_id: dealer,
    delivery_id: 'DEL',
    paid_amount: amount,
    paid_at: '2026-06-01',
  }
}

test('gemischte Zuteilung (agent + internal): Agentin bekommt Provision auf den vollen eingegangenen Betrag', () => {
  // Händler D1 hat in derselben Saison sowohl eine agent- als auch eine
  // internal-Order; eingegangen sind 1000 €.
  const ov = computeCommissionOverview(
    data(
      [order('D1', 'agent'), order('D1', 'internal')],
      [paid('D1', '1000.00')],
    ),
    [SEASON],
    15,
  )
  const row = ov.seasons[0]
  assert.equal(row.actualBase, 1000) // voller Betrag, nicht nur der Agent-Anteil
  assert.equal(row.paymentsWithoutOrder, 0) // kein „ohne Order"-Hinweis
  assert.equal((row.actualBase * ov.ratePercent) / 100, 150) // Provision auf vollen Betrag
})

test('nur internal-Orders: keine Provision (Basis 0), kein Hinweis', () => {
  const ov = computeCommissionOverview(
    data([order('D2', 'internal')], [paid('D2', 500)]),
    [SEASON],
    15,
  )
  const row = ov.seasons[0]
  assert.equal(row.actualBase, 0)
  assert.equal(row.paymentsWithoutOrder, 0)
})

test('reine agent-Zuteilung: voller Betrag zählt (unverändert)', () => {
  const ov = computeCommissionOverview(
    data([order('D3', 'agent')], [paid('D3', 200)]),
    [SEASON],
    15,
  )
  assert.equal(ov.seasons[0].actualBase, 200)
})

test('Zahlung ohne bestätigte Order in der Saison: markiert, zählt nicht', () => {
  // Keine (bestätigte) Order für D4 → keine Zuteilung ableitbar.
  const ov = computeCommissionOverview(data([], [paid('D4', 300)]), [SEASON], 15)
  const row = ov.seasons[0]
  assert.equal(row.actualBase, 0)
  assert.equal(row.paymentsWithoutOrder, 1)
})

test('agentGetsCommission: Regel an einer Stelle', () => {
  assert.equal(agentGetsCommission(new Set(['agent'])), true)
  assert.equal(agentGetsCommission(new Set(['agent', 'internal'])), true) // gemischt
  assert.equal(agentGetsCommission(new Set(['internal'])), false)
  assert.equal(agentGetsCommission(new Set()), false)
  assert.equal(agentGetsCommission(undefined), false)
})
