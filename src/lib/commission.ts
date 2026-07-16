import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { listSeasons } from './seasons'
import {
  agentGetsCommission,
  buildAssignmentMap,
  computeCommissionOverview,
  key,
  num,
  type CommissionData,
  type OrderForCalc,
  type PaidInvoice,
} from './commissionCalc'
import type {
  CommissionOverview,
  CommissionSettlementRow,
} from '../types/commission'

/** Standardrate, falls (noch) keine commission_settings-Zeile existiert. */
const DEFAULT_RATE = 15

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

async function loadCommissionData(): Promise<CommissionData> {
  const [ordersRes, deliveriesRes, invoicesRes] = await Promise.all([
    supabase
      .from('orders')
      .select('dealer_id, season_id, assignment, status'),
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

// ─── Übersicht (tatsächlich eingegangene Provision) ─────────────────────────

export async function getCommissionOverview(): Promise<CommissionOverview> {
  const [ratePercent, seasons, data] = await Promise.all([
    getCommissionRate(),
    listSeasons(),
    loadCommissionData(),
  ])
  return computeCommissionOverview(data, seasons, ratePercent)
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
    if (agentGetsCommission(set)) {
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
