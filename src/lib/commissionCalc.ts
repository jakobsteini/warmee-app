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

export interface CommissionData {
  orders: OrderForCalc[]
  /** delivery_id → season_id (über die Produktionsbestellung). */
  deliverySeason: Map<string, string>
  paidInvoices: PaidInvoice[]
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

  // Aktive Saison zuerst, dann übrige.
  const rows = [...byId.values()].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active),
  )
  return { ratePercent, seasons: rows }
}
