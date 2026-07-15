import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { listSeasons } from './seasons'
import type {
  CommissionOverview,
  CommissionSettlementRow,
  SeasonCommission,
} from '../types/commission'

/** Standardrate, falls (noch) keine commission_settings-Zeile existiert. */
const DEFAULT_RATE = 15

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Auf zwei Nachkommastellen runden (Geldbetrag). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Provisionsrate (editierbar) ────────────────────────────────────────────

/** Aktuelle Provisionsrate in % (eine Zeile je Org). */
export async function getCommissionRate(): Promise<number> {
  const { data, error } = await supabase
    .from('commission_settings')
    .select('commission_percent')
    .maybeSingle()

  if (error) throw error
  return data ? num(data.commission_percent) : DEFAULT_RATE
}

/** Provisionsrate setzen (Upsert je Org). */
export async function setCommissionRate(percent: number): Promise<void> {
  const org_id = await getMyOrgId()
  const { error } = await supabase.from('commission_settings').upsert(
    {
      org_id,
      commission_percent: percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id' },
  )
  if (error) throw error
}

// ─── Datenbeschaffung für die Berechnung ────────────────────────────────────

interface OrderForCalc {
  dealer_id: string
  season_id: string
  assignment: string
  status: string
  order_items: { quantity: number; unit_price: number | string | null }[]
}

interface PaidInvoice {
  dealer_id: string
  delivery_id: string | null
  paid_amount: number | string | null
  paid_at: string | null
}

interface CommissionData {
  orders: OrderForCalc[]
  /** delivery_id → season_id (über die Produktionsbestellung). */
  deliverySeason: Map<string, string>
  paidInvoices: PaidInvoice[]
}

/** Summe einer Order (Menge × Einzelpreis) über ihre Zeilen. */
function orderAmount(o: OrderForCalc): number {
  return o.order_items.reduce(
    (sum, i) => sum + (i.quantity ?? 0) * num(i.unit_price),
    0,
  )
}

/** Schlüssel (Händler, Saison). */
function key(dealerId: string, seasonId: string): string {
  return `${dealerId}|${seasonId}`
}

async function loadCommissionData(): Promise<CommissionData> {
  const [ordersRes, deliveriesRes, invoicesRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'dealer_id, season_id, assignment, status, order_items(quantity, unit_price)',
      ),
    supabase
      .from('deliveries')
      .select('id, production_order:production_orders(season_id)'),
    // Bezahlte, nicht stornierte Rechnungen (paid_at ist die maßgebliche Quelle).
    supabase
      .from('invoices')
      .select('dealer_id, delivery_id, paid_amount, paid_at')
      .not('paid_at', 'is', null)
      .neq('status', 'cancelled'),
  ])

  if (ordersRes.error) throw ordersRes.error
  if (deliveriesRes.error) throw deliveriesRes.error
  if (invoicesRes.error) throw invoicesRes.error

  const deliverySeason = new Map<string, string>()
  for (const d of (deliveriesRes.data ?? []) as unknown as {
    id: string
    production_order: { season_id: string } | null
  }[]) {
    if (d.production_order?.season_id) {
      deliverySeason.set(d.id, d.production_order.season_id)
    }
  }

  return {
    orders: (ordersRes.data ?? []) as unknown as OrderForCalc[],
    deliverySeason,
    paidInvoices: (invoicesRes.data ?? []) as unknown as PaidInvoice[],
  }
}

/**
 * Zuteilung je (Händler, Saison) aus den BESTÄTIGTEN Orders. Eine Menge, damit
 * gemischte Zuteilungen (agent + internal in derselben (Händler, Saison))
 * erkennbar sind.
 */
function buildAssignmentMap(orders: OrderForCalc[]): Map<string, Set<string>> {
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

// ─── Übersicht (Vorab vs. tatsächlich eingegangen) ──────────────────────────

export async function getCommissionOverview(): Promise<CommissionOverview> {
  const [ratePercent, seasons, data] = await Promise.all([
    getCommissionRate(),
    listSeasons(),
    loadCommissionData(),
  ])

  const assignmentMap = buildAssignmentMap(data.orders)

  const byId = new Map<string, SeasonCommission>()
  for (const s of seasons) {
    byId.set(s.id, {
      season_id: s.id,
      season_label: s.label,
      is_active: !!s.is_active,
      advanceBase: 0,
      actualBase: 0,
      unattributedCount: 0,
      mixed: false,
    })
  }

  // Vorab-Basis: Agent-Ordervolumen aus bestätigten Orders je Saison.
  for (const o of data.orders) {
    if (o.status !== 'confirmed' || o.assignment !== 'agent') continue
    const row = byId.get(o.season_id)
    if (row) row.advanceBase += orderAmount(o)
  }

  // Ist-Basis: eingegangene Zahlungen, attribuiert über (Händler, Saison).
  for (const inv of data.paidInvoices) {
    const seasonId = inv.delivery_id
      ? data.deliverySeason.get(inv.delivery_id)
      : undefined
    if (!seasonId) continue // freie Rechnung / kein Saison-Bezug → nicht zuordenbar
    const row = byId.get(seasonId)
    if (!row) continue
    const set = assignmentMap.get(key(inv.dealer_id, seasonId))
    const paid = num(inv.paid_amount)
    if (!set || set.size === 0) {
      row.unattributedCount += 1
    } else if (set.size === 1 && set.has('agent')) {
      row.actualBase += paid
    } else if (set.size === 1 && set.has('internal')) {
      // intern → keine Provision, keine Warnung
    } else {
      row.mixed = true
      row.unattributedCount += 1
    }
  }

  // Aktive Saison zuerst, dann übrige.
  const rows = [...byId.values()].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active),
  )
  return { ratePercent, seasons: rows }
}

// ─── Abrechnungen (eingefrorenes Dokument) ──────────────────────────────────

/** Alle Abrechnungen inkl. Saison-Label, neueste zuerst. */
export async function listSettlements(): Promise<CommissionSettlementRow[]> {
  const { data, error } = await supabase
    .from('commission_settlements')
    .select('*, season:seasons(label)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as CommissionSettlementRow[]
}

export interface CreateSettlementInput {
  season_id: string
  period_from: string
  period_to: string
  notes: string | null
}

/**
 * Abrechnung für (Saison, Zeitraum) erstellen. Basis: der Agentin eindeutig
 * zugeordnete, im Zeitraum EINGEGANGENE Zahlungen. Rate + Beträge werden
 * eingefroren. deductions (Retouren/Gutschriften) sind aktuell immer 0.
 */
export async function createSettlement(
  input: CreateSettlementInput,
): Promise<void> {
  const [org_id, created_by, ratePercent, data] = await Promise.all([
    getMyOrgId(),
    getMyUserId(),
    getCommissionRate(),
    loadCommissionData(),
  ])

  const assignmentMap = buildAssignmentMap(data.orders)

  let gross = 0
  for (const inv of data.paidInvoices) {
    if (!inv.delivery_id || !inv.paid_at) continue
    const seasonId = data.deliverySeason.get(inv.delivery_id)
    if (seasonId !== input.season_id) continue
    if (inv.paid_at < input.period_from || inv.paid_at > input.period_to) continue
    const set = assignmentMap.get(key(inv.dealer_id, seasonId))
    if (set && set.size === 1 && set.has('agent')) {
      gross += num(inv.paid_amount)
    }
  }

  const grossReceived = round2(gross)
  const deductions = 0 // Retouren/Gutschriften: eigener Baustein, aktuell 0.
  const netBase = round2(grossReceived - deductions)
  const commissionAmount = round2((netBase * ratePercent) / 100)

  const { error } = await supabase.from('commission_settlements').insert({
    org_id,
    season_id: input.season_id,
    assignment: 'agent',
    period_from: input.period_from,
    period_to: input.period_to,
    rate_percent: ratePercent,
    gross_received: grossReceived,
    deductions,
    net_base: netBase,
    commission_amount: commissionAmount,
    notes: input.notes,
    created_by,
  })

  if (error) throw error
}

/** Abrechnung löschen. */
export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await supabase
    .from('commission_settlements')
    .delete()
    .eq('id', id)
  if (error) throw error
}
