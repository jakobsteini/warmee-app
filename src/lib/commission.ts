import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { listSeasons } from './seasons'
import {
  computeCommissionOverview,
  computeSettlementBase,
  lateReturnsBySettlement,
  num,
  type CommissionData,
  type OrderForCalc,
  type PaidInvoice,
  type ReturnForCalc,
  type SettlementForFlag,
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
  const [ordersRes, deliveriesRes, invoicesRes, returnsRes] = await Promise.all([
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
    // Recorded Retouren mit der Lieferung der verankerten Rechnung (→ Saison).
    // NUR rechnungs-verankerte Retouren zählen zur Provision — LS-verankerte
    // Kommissions-Rücksendungen (invoice_id null, Betrag 0) sind keine
    // Geld-Gutschrift und bleiben außen vor.
    supabase
      .from('returns')
      .select('dealer_id, total_amount, return_date, created_at, status, invoice:invoices(delivery_id)')
      .eq('status', 'recorded')
      .not('invoice_id', 'is', null),
  ])

  if (ordersRes.error) throw ordersRes.error
  if (deliveriesRes.error) throw deliveriesRes.error
  if (invoicesRes.error) throw invoicesRes.error
  if (returnsRes.error) throw returnsRes.error

  const deliverySeason = new Map<string, string>()
  for (const d of (deliveriesRes.data ?? []) as unknown as {
    id: string
    production_order: { season_id: string } | null
  }[]) {
    if (d.production_order?.season_id) {
      deliverySeason.set(d.id, d.production_order.season_id)
    }
  }

  const returns: ReturnForCalc[] = (
    (returnsRes.data ?? []) as unknown as {
      dealer_id: string
      total_amount: number | string
      return_date: string | null
      created_at: string | null
      status: string
      invoice: { delivery_id: string | null } | null
    }[]
  ).map((r) => ({
    dealer_id: r.dealer_id,
    delivery_id: r.invoice?.delivery_id ?? null,
    total_amount: r.total_amount,
    return_date: r.return_date,
    created_at: r.created_at,
    status: r.status,
  }))

  return {
    orders: (ordersRes.data ?? []) as unknown as OrderForCalc[],
    deliverySeason,
    paidInvoices: (invoicesRes.data ?? []) as unknown as PaidInvoice[],
    returns,
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
 * zugeordnete, im Zeitraum EINGEGANGENE Zahlungen minus die im Zeitraum (nach
 * return_date) recorded Retouren. Rate + Beträge werden eingefroren. Die Regel
 * lebt zentral in computeSettlementBase (dieselbe wie in der Übersicht).
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

  const { grossReceived, deductions, netBase } = computeSettlementBase(data, {
    season_id: input.season_id,
    period_from: input.period_from,
    period_to: input.period_to,
  })
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

/**
 * Nachträgliche Retouren je Abrechnung (settlement_id → Summe brutto): recorded,
 * agent-berechtigte Retouren mit return_date in der Periode, die ERST NACH dem
 * Einfrieren erfasst wurden — also nicht in den eingefrorenen deductions stecken.
 * Für den Hinweis-Badge; verändert die Abrechnung NICHT.
 */
export async function getLateReturnFlags(
  settlements: SettlementForFlag[],
): Promise<Map<string, number>> {
  if (settlements.length === 0) return new Map()
  const data = await loadCommissionData()
  return lateReturnsBySettlement(settlements, data)
}

/** Abrechnung löschen. */
export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await supabase
    .from('commission_settlements')
    .delete()
    .eq('id', id)
  if (error) throw error
}
