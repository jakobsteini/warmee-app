// Reiner Rechenkern der Provision — bewusst OHNE Supabase-Import, damit die
// Logik unter `node --test` (ohne Vite-Env) prüfbar ist (Muster wie itemKey.ts).
// `commission.ts` beschafft die Daten und delegiert die Berechnung hierher.
import type { CommissionOverview, SeasonCommission } from '../types/commission'

/** numeric/number/null robust zu number. */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Auf zwei Nachkommastellen runden (Geldbetrag). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Schlüssel (Händler, Saison). */
export function key(dealerId: string, seasonId: string): string {
  return `${dealerId}|${seasonId}`
}

export interface OrderForCalc {
  dealer_id: string
  season_id: string
  assignment: string
  status: string
}

export interface PaidInvoice {
  dealer_id: string
  delivery_id: string | null
  paid_amount: number | string | null
  paid_at: string | null
}

/**
 * Eine (recorded) Retoure für die Provisions-Abzüge. delivery_id kommt über die
 * verankerte Rechnung (Retoure → invoice.delivery_id → Saison). total_amount ist
 * BRUTTO (wie gross_received/paid_amount).
 */
export interface ReturnForCalc {
  dealer_id: string
  delivery_id: string | null
  total_amount: number | string
  return_date: string | null
  created_at: string | null
  status: string
}

export interface CommissionData {
  orders: OrderForCalc[]
  /** delivery_id → season_id (über die Produktionsbestellung). */
  deliverySeason: Map<string, string>
  paidInvoices: PaidInvoice[]
  /** Recorded Retouren (Storno zählt nicht). */
  returns: ReturnForCalc[]
}

/** Minimal-Saison für die reine Übersichtsberechnung. */
export interface SeasonInput {
  id: string
  label: string
  is_active?: boolean | null
}

/**
 * Zuteilung je (Händler, Saison) aus den BESTÄTIGTEN Orders. Eine Menge, damit
 * gemischte Zuteilungen (agent + internal in derselben (Händler, Saison))
 * erkennbar sind.
 */
export function buildAssignmentMap(
  orders: OrderForCalc[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const o of orders) {
    if (o.status !== 'confirmed') continue
    const k = key(o.dealer_id, o.season_id)
    const set = map.get(k) ?? new Set<string>()
    set.add(o.assignment)
    map.set(k, set)
  }
  return map
}

/**
 * Provisionsregel an EINER Stelle (Übersicht + Abrechnung nutzen sie beide):
 * Die Agentin bekommt die Provision auf den vollen eingegangenen Betrag, wenn
 * die (Händler, Saison)-Zuteilung 'agent' enthält — d. h. reine Agent-Zuteilung
 * ODER gemischt (agent + internal). Kundenentscheidung 2026-07-15. Nur-internal
 * und „keine bestätigte Order" zählen NICHT.
 */
export function agentGetsCommission(set: Set<string> | undefined): boolean {
  return !!set && set.has('agent')
}

/**
 * Reiner Rechenkern der Provisionsübersicht (ohne Datenbank, testbar). Attribuiert
 * eingegangene Zahlungen über (Händler, Saison) auf die Ist-Basis der Agentin.
 */
export function computeCommissionOverview(
  data: CommissionData,
  seasons: SeasonInput[],
  ratePercent: number,
): CommissionOverview {
  const assignmentMap = buildAssignmentMap(data.orders)

  const byId = new Map<string, SeasonCommission>()
  for (const s of seasons) {
    byId.set(s.id, {
      season_id: s.id,
      season_label: s.label,
      is_active: !!s.is_active,
      actualBase: 0,
      deductions: 0,
      paymentsWithoutOrder: 0,
    })
  }

  // Ist-Basis: eingegangene Zahlungen, attribuiert über (Händler, Saison).
  for (const inv of data.paidInvoices) {
    const seasonId = inv.delivery_id
      ? data.deliverySeason.get(inv.delivery_id)
      : undefined
    if (!seasonId) continue // freie Rechnung / kein Saison-Bezug → still übersprungen
    const row = byId.get(seasonId)
    if (!row) continue
    const set = assignmentMap.get(key(inv.dealer_id, seasonId))
    const paid = num(inv.paid_amount)
    if (!set || set.size === 0) {
      // Keine bestätigte Order in (Händler, Saison) → keine Zuteilung ableitbar.
      row.paymentsWithoutOrder += 1
    } else if (agentGetsCommission(set)) {
      row.actualBase += paid
    }
    // Nur internal (set = {internal}) → keine Provision, kein Hinweis.
  }

  // Abzüge: recorded Retouren, agent-berechtigt, je Saison (kumulativ — dieselbe
  // Regel wie bei der Basis, keine zweite Rechenstelle).
  for (const r of data.returns) {
    if (r.status !== 'recorded' || !r.delivery_id) continue
    const seasonId = data.deliverySeason.get(r.delivery_id)
    if (!seasonId) continue
    const row = byId.get(seasonId)
    if (!row) continue
    if (agentGetsCommission(assignmentMap.get(key(r.dealer_id, seasonId)))) {
      row.deductions += num(r.total_amount)
    }
  }

  for (const row of byId.values()) {
    row.actualBase = round2(row.actualBase)
    row.deductions = round2(row.deductions)
  }

  // Aktive Saison zuerst, dann übrige.
  const rows = [...byId.values()].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active),
  )
  return { ratePercent, seasons: rows }
}

/** Zeitraum einer Abrechnung (Saison + Datumsspanne). */
export interface SettlementPeriod {
  season_id: string
  period_from: string
  period_to: string
}

/** Bemessungsgrundlage einer Abrechnung: brutto − Abzüge = Netto-Basis. */
export interface SettlementBase {
  grossReceived: number
  deductions: number
  netBase: number
}

/**
 * Bemessungsgrundlage einer Abrechnung für (Saison, Zeitraum) — die EINE
 * Rechenstelle für Übersicht und Abrechnung derselben Regel:
 *   • gross_received = agent-berechtigte, im Zeitraum (paid_at) eingegangene
 *     Zahlungen (brutto)
 *   • deductions     = agent-berechtigte, im Zeitraum (return_date) recorded
 *     Retouren (brutto); Storno zählt nicht
 *   • net_base       = gross_received − deductions
 */
export function computeSettlementBase(
  data: CommissionData,
  period: SettlementPeriod,
): SettlementBase {
  const assignmentMap = buildAssignmentMap(data.orders)

  let gross = 0
  for (const inv of data.paidInvoices) {
    if (!inv.delivery_id || !inv.paid_at) continue
    const seasonId = data.deliverySeason.get(inv.delivery_id)
    if (seasonId !== period.season_id) continue
    if (inv.paid_at < period.period_from || inv.paid_at > period.period_to) continue
    if (agentGetsCommission(assignmentMap.get(key(inv.dealer_id, seasonId)))) {
      gross += num(inv.paid_amount)
    }
  }

  let deductions = 0
  for (const r of data.returns) {
    if (r.status !== 'recorded' || !r.delivery_id || !r.return_date) continue
    const seasonId = data.deliverySeason.get(r.delivery_id)
    if (seasonId !== period.season_id) continue
    if (r.return_date < period.period_from || r.return_date > period.period_to) continue
    if (agentGetsCommission(assignmentMap.get(key(r.dealer_id, seasonId)))) {
      deductions += num(r.total_amount)
    }
  }

  const grossReceived = round2(gross)
  const ded = round2(deductions)
  return { grossReceived, deductions: ded, netBase: round2(grossReceived - ded) }
}

/** Eingefrorene Abrechnung, reduziert auf das für die Badge-Prüfung Nötige. */
export interface SettlementForFlag {
  id: string
  season_id: string
  period_from: string
  period_to: string
  created_at: string | null
}

/**
 * Nachträgliche Retouren je Abrechnung: recorded, agent-berechtigte Retouren,
 * deren return_date in die Periode der Abrechnung fällt, die aber ERST NACH dem
 * Einfrieren (created_at) erfasst wurden — also in den eingefrorenen deductions
 * nicht enthalten sein können. Map settlement_id → Summe (nur > 0). Die
 * Abrechnung selbst wird NICHT verändert (Hinweis-Badge, kein stiller Umbau).
 */
export function lateReturnsBySettlement(
  settlements: SettlementForFlag[],
  data: CommissionData,
): Map<string, number> {
  const assignmentMap = buildAssignmentMap(data.orders)
  const flags = new Map<string, number>()
  for (const s of settlements) {
    let sum = 0
    for (const r of data.returns) {
      if (r.status !== 'recorded' || !r.delivery_id || !r.return_date) continue
      const seasonId = data.deliverySeason.get(r.delivery_id)
      if (seasonId !== s.season_id) continue
      if (r.return_date < s.period_from || r.return_date > s.period_to) continue
      // Vor/bei dem Einfrieren erfasst → in der Abrechnung enthalten, kein Hinweis.
      if (s.created_at && r.created_at && r.created_at <= s.created_at) continue
      if (agentGetsCommission(assignmentMap.get(key(r.dealer_id, seasonId)))) {
        sum += num(r.total_amount)
      }
    }
    if (sum > 0) flags.set(s.id, round2(sum))
  }
  return flags
}
