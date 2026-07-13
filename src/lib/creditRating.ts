import { supabase } from './supabase'
import { addDaysIso } from './dates'
import { formatEUR } from './money'
import { DEFAULT_ZAHLUNGSZIEL_TAGE } from './tax'

// ============================================================================
// Bonitäts-Bewertung je Händler — rein aus den EIGENEN Zahlungsdaten abgeleitet
// (keine externen Bonitätsdienste). Nur Read-Queries, org-scoped über RLS.
// ============================================================================

/**
 * Schwellenwerte der Bonitäts-Ampel. BEWUSST hier zentral & benannt, damit die
 * Werte später an einer einzigen Stelle justiert werden können.
 *
 * Regel (transparent, siehe rateDealer):
 *   • ROT     — es gibt aktuell überfällige Beträge  ODER
 *               Ø-Zahlungsverzug > avgDelayRedDays
 *   • GELB    — Ø-Zahlungsverzug > avgDelayYellowDays (leichter Verzug)
 *   • GRÜN    — nichts überfällig und Ø-Verzug ≤ avgDelayYellowDays
 *   • NEUTRAL — keine (aktiven) Rechnungen vorhanden → keine Aussage möglich
 */
export const CREDIT_THRESHOLDS = {
  /** Ab diesem Ø-Zahlungsverzug (Tage) wird die Ampel gelb. */
  avgDelayYellowDays: 7,
  /** Ab diesem Ø-Zahlungsverzug (Tage) wird die Ampel rot (auch ohne offene Überfälligkeit). */
  avgDelayRedDays: 21,
} as const

export type CreditRating = 'green' | 'yellow' | 'red' | 'neutral'

export interface DealerCredit {
  rating: CreditRating
  /** Anzahl aktiver (nicht stornierter) Rechnungen. */
  invoiceCount: number
  /** Summe offener (versendeter, unbezahlter) Rechnungen. */
  openAmount: number
  /** Summe überfälliger offener Rechnungen. */
  overdueAmount: number
  overdueCount: number
  /** Ø Zahlungsverzug in Tagen über bezahlte Rechnungen (paid_at − Fälligkeit); null ohne bezahlte. */
  avgDelayDays: number | null
  paidCount: number
  /** Menschliche Erklärung der Ampel-Farbe (für Tooltip). */
  reason: string
}

/** Aggregierte Geld-Kennzahlen (org-weit) für das Auswertungs-Dashboard. */
export interface MoneySnapshot {
  openTotal: number
  overdueTotal: number
  overdueCount: number
  avgPaymentDelayDays: number | null
  paidInvoiceCount: number
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

/** Heute als ISO-Kurzdatum (YYYY-MM-DD). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Ganze Tage zwischen zwei ISO-Daten (a − b); positiv = a liegt später. */
function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  return Math.round((a - b) / 86_400_000)
}

/** Normalisierte Rechnung, reduziert auf das für die Bewertung Nötige. */
interface NormInvoice {
  dealer_id: string
  status: string
  total: number
  /** Fälligkeit: due_date, sonst invoice_date + zahlungsziel_tage (Fallback Standard). */
  dueIso: string | null
  /** Zahlungsdatum, falls bezahlt. */
  paidAtIso: string | null
}

/** Rohzeile aus der Rechnungs-Abfrage (mit Händler-Zahlungsziel). */
interface RawInvoice {
  dealer_id: string
  status: string
  total: number | string | null
  invoice_date: string | null
  due_date: string | null
  paid_at?: string | null
  dealer: { zahlungsziel_tage: number | null } | null
}

function normalize(row: RawInvoice): NormInvoice {
  let dueIso: string | null = row.due_date ?? null
  if (!dueIso && row.invoice_date) {
    const ziel = row.dealer?.zahlungsziel_tage ?? DEFAULT_ZAHLUNGSZIEL_TAGE
    dueIso = addDaysIso(row.invoice_date, ziel)
  }
  return {
    dealer_id: row.dealer_id,
    status: row.status,
    total: num(row.total),
    dueIso,
    paidAtIso: row.paid_at ?? null,
  }
}

/**
 * Aktive (nicht stornierte) Rechnungen laden, normalisiert. Read-only,
 * org-scoped über RLS. Mit `*` statt expliziter Spaltenliste, damit die Abfrage
 * auch dann trägt, falls die paid_at-Migration noch nicht eingespielt ist
 * (fehlende Spalte → undefined → als „nicht bezahlt" behandelt).
 */
async function loadActiveInvoices(): Promise<NormInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, dealer:dealers(zahlungsziel_tage)')
    .neq('status', 'cancelled')

  if (error) throw error
  return ((data ?? []) as unknown as RawInvoice[]).map(normalize)
}

interface Summary {
  invoiceCount: number
  openAmount: number
  overdueAmount: number
  overdueCount: number
  avgDelayDays: number | null
  paidCount: number
}

/** Kern-Aggregation über eine Menge Rechnungen (org-weit oder je Händler). */
function summarize(rows: NormInvoice[], today: string): Summary {
  let openAmount = 0
  let overdueAmount = 0
  let overdueCount = 0
  let paidCount = 0
  const delays: number[] = []

  for (const r of rows) {
    if (r.status === 'sent') {
      openAmount += r.total
      if (r.dueIso && r.dueIso < today) {
        overdueAmount += r.total
        overdueCount += 1
      }
    } else if (r.status === 'paid') {
      paidCount += 1
      if (r.paidAtIso && r.dueIso) {
        delays.push(daysBetween(r.paidAtIso, r.dueIso))
      }
    }
  }

  const avgDelayDays =
    delays.length > 0
      ? delays.reduce((s, d) => s + d, 0) / delays.length
      : null

  return {
    invoiceCount: rows.length,
    openAmount,
    overdueAmount,
    overdueCount,
    avgDelayDays,
    paidCount,
  }
}

/** Ampel-Farbe aus einer Zusammenfassung nach der transparenten Regel. */
export function rateDealer(s: Summary): CreditRating {
  if (s.invoiceCount === 0) return 'neutral'
  if (
    s.overdueAmount > 0 ||
    (s.avgDelayDays !== null && s.avgDelayDays > CREDIT_THRESHOLDS.avgDelayRedDays)
  ) {
    return 'red'
  }
  if (s.avgDelayDays !== null && s.avgDelayDays > CREDIT_THRESHOLDS.avgDelayYellowDays) {
    return 'yellow'
  }
  return 'green'
}

/** Menschliche Begründung der Ampel-Farbe. */
function buildReason(s: Summary): string {
  if (s.invoiceCount === 0) return 'Keine Rechnungen vorhanden.'
  const parts: string[] = []
  if (s.overdueCount > 0) {
    parts.push(
      `${s.overdueCount} überfällige Rechnung${s.overdueCount > 1 ? 'en' : ''} (${formatEUR(s.overdueAmount)})`,
    )
  }
  if (s.avgDelayDays !== null) {
    const d = Math.round(s.avgDelayDays)
    if (d > 0) parts.push(`Ø ${d} Tage zu spät`)
    else if (d < 0) parts.push(`Ø ${Math.abs(d)} Tage früher gezahlt`)
    else parts.push('Ø pünktlich')
  }
  if (s.overdueCount === 0 && s.openAmount > 0) {
    parts.push(`${formatEUR(s.openAmount)} offen, nichts überfällig`)
  }
  if (parts.length === 0) parts.push('Alles bezahlt, pünktlich')
  return parts.join(' · ')
}

function toDealerCredit(s: Summary): DealerCredit {
  return {
    rating: rateDealer(s),
    invoiceCount: s.invoiceCount,
    openAmount: s.openAmount,
    overdueAmount: s.overdueAmount,
    overdueCount: s.overdueCount,
    avgDelayDays: s.avgDelayDays,
    paidCount: s.paidCount,
    reason: buildReason(s),
  }
}

// ─── Öffentliche API ────────────────────────────────────────────────────────

/** Bonitäts-Bewertung je Händler (dealer_id → DealerCredit). Read-only. */
export async function listDealerCredits(): Promise<Map<string, DealerCredit>> {
  const rows = await loadActiveInvoices()
  const today = todayIso()

  const byDealer = new Map<string, NormInvoice[]>()
  for (const r of rows) {
    const list = byDealer.get(r.dealer_id)
    if (list) list.push(r)
    else byDealer.set(r.dealer_id, [r])
  }

  const result = new Map<string, DealerCredit>()
  for (const [dealerId, list] of byDealer) {
    result.set(dealerId, toDealerCredit(summarize(list, today)))
  }
  return result
}

/** Org-weite Geld-Kennzahlen (offen, überfällig, Zahlungsmoral). Read-only. */
export async function getMoneySnapshot(): Promise<MoneySnapshot> {
  const rows = await loadActiveInvoices()
  const s = summarize(rows, todayIso())
  return {
    openTotal: s.openAmount,
    overdueTotal: s.overdueAmount,
    overdueCount: s.overdueCount,
    avgPaymentDelayDays: s.avgDelayDays,
    paidInvoiceCount: s.paidCount,
  }
}
