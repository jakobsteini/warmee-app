import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agentGetsCommission,
  computeCommissionOverview,
  computeSettlementBase,
  lateReturnsBySettlement,
  type CommissionData,
} from './commissionCalc.ts'

const SEASON = { id: 'S1', label: 'SS27', is_active: true }

/** Baut CommissionData für EINE Saison (S1), Lieferung DEL→S1 vorverdrahtet. */
function data(
  orders: CommissionData['orders'],
  paidInvoices: CommissionData['paidInvoices'],
  returns: CommissionData['returns'] = [],
): CommissionData {
  return {
    orders,
    deliverySeason: new Map([['DEL', 'S1']]),
    paidInvoices,
    returns,
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

/** Recorded Retoure (über DEL an S1 gebunden), Standard-Datum im Juni. */
function ret(
  dealer: string,
  amount: number | string,
  opts: { return_date?: string; created_at?: string; status?: string } = {},
) {
  return {
    dealer_id: dealer,
    delivery_id: 'DEL',
    total_amount: amount,
    return_date: opts.return_date ?? '2026-06-15',
    created_at: opts.created_at ?? '2026-06-16T10:00:00Z',
    status: opts.status ?? 'recorded',
  }
}

const PERIOD = { season_id: 'S1', period_from: '2026-06-01', period_to: '2026-06-30' }

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

// ─── Modul 5: Retouren-Abzüge ───────────────────────────────────────────────

test('computeSettlementBase: net_base = gross_received − deductions', () => {
  const b = computeSettlementBase(
    data([order('D1', 'agent')], [paid('D1', '1000.00')], [ret('D1', '150.00')]),
    PERIOD,
  )
  assert.equal(b.grossReceived, 1000)
  assert.equal(b.deductions, 150)
  assert.equal(b.netBase, 850)
})

test('computeSettlementBase: Retoure außerhalb des Zeitraums (return_date) zählt nicht', () => {
  const b = computeSettlementBase(
    data(
      [order('D1', 'agent')],
      [paid('D1', 1000)],
      [ret('D1', 150, { return_date: '2026-07-05' })], // nach period_to
    ),
    PERIOD,
  )
  assert.equal(b.deductions, 0)
  assert.equal(b.netBase, 1000)
})

test('computeSettlementBase: nur agent-berechtigte Retouren mindern; Storno zählt nicht', () => {
  const b = computeSettlementBase(
    data(
      [order('D1', 'agent'), order('D2', 'internal')],
      [paid('D1', 1000)],
      [
        ret('D2', 200), // internal → nicht agent-berechtigt
        ret('D1', 100, { status: 'cancelled' }), // Storno → zählt nicht
        ret('D1', 90), // agent-berechtigt, recorded → zählt
      ],
    ),
    PERIOD,
  )
  assert.equal(b.deductions, 90)
  assert.equal(b.netBase, 910)
})

test('computeCommissionOverview: recorded Retoure mindert die Netto-Provision', () => {
  const ov = computeCommissionOverview(
    data([order('D1', 'agent')], [paid('D1', 1000)], [ret('D1', 200)]),
    [SEASON],
    15,
  )
  const row = ov.seasons[0]
  assert.equal(row.actualBase, 1000)
  assert.equal(row.deductions, 200)
  assert.equal(((row.actualBase - row.deductions) * ov.ratePercent) / 100, 120)
})

test('lateReturnsBySettlement: Retoure NACH dem Einfrieren in der Periode → Hinweis', () => {
  const settlements = [
    {
      id: 'SET1',
      season_id: 'S1',
      period_from: '2026-06-01',
      period_to: '2026-06-30',
      created_at: '2026-07-01T00:00:00Z',
    },
  ]
  // Retoure am 15.06 (in Periode), aber erst am 02.07 erfasst → nach dem Einfrieren.
  const late = ret('D1', 150, { created_at: '2026-07-02T09:00:00Z' })
  const flags = lateReturnsBySettlement(
    settlements,
    data([order('D1', 'agent')], [], [late]),
  )
  assert.equal(flags.get('SET1'), 150)
})

test('lateReturnsBySettlement: vor dem Einfrieren erfasste Retoure ist enthalten → kein Hinweis', () => {
  const settlements = [
    {
      id: 'SET1',
      season_id: 'S1',
      period_from: '2026-06-01',
      period_to: '2026-06-30',
      created_at: '2026-07-01T00:00:00Z',
    },
  ]
  const early = ret('D1', 150, { created_at: '2026-06-20T09:00:00Z' })
  const flags = lateReturnsBySettlement(
    settlements,
    data([order('D1', 'agent')], [], [early]),
  )
  assert.equal(flags.has('SET1'), false)
})
