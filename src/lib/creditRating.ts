import { supabase } from './supabase'
import { formatEUR } from './money'
import { faelligkeitIso, todayIso } from './dueDates'
import { openAfterReturns } from './returnsCalc'
import { refundDue } from './refundCalc'
import { recordedReturnsByInvoice } from './returns'

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
  /**
   * Offene Rückerstattung an den Händler (brutto, ≥ 0): bezahlte Rechnung, danach
   * retourniert. Umgekehrtes Vorzeichen zu openAmount — BEWUSST getrennt, nie
   * dort hineingerechnet.
   */
  refundOpen: number
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
  /** Summe offener Rückerstattungen (bezahlt + danach retourniert), getrennt von openTotal. */
  refundTotal: number
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

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
  /** Summe der (recorded) Retouren-Gutschriften dieser Rechnung, BRUTTO. */
  returnsTotal: number
  /** Fälligkeit: due_date, sonst invoice_date + zahlungsziel_tage (Fallback Standard). */
  dueIso: string | null
  /** Zahlungsdatum, falls bezahlt. */
  paidAtIso: string | null
  /** Gezahlter Bruttobetrag (0, wenn nicht/leer bezahlt) — Basis der Rückerstattung. */
  paidAmount: number
}

/** Rohzeile aus der Rechnungs-Abfrage (mit Händler-Zahlungsziel). */
interface RawInvoice {
  id: string
  dealer_id: string
  status: string
  total: number | string | null
  invoice_date: string | null
  due_date: string | null
  paid_at?: string | null
  paid_amount?: number | string | null
  dealer: { zahlungsziel_tage: number | null } | null
}

function normalize(row: RawInvoice, returnsByInvoice: Map<string, number>): NormInvoice {
  return {
    dealer_id: row.dealer_id,
    status: row.status,
    total: num(row.total),
    returnsTotal: returnsByInvoice.get(row.id) ?? 0,
    // Fälligkeit über die gemeinsame Logik (dueDates): due_date, sonst
    // invoice_date + Händler-Zahlungsziel. Identisch zur Offene-Posten-Liste.
    dueIso: faelligkeitIso(row),
    paidAtIso: row.paid_at ?? null,
    paidAmount: num(row.paid_amount),
  }
}

/**
 * Aktive (nicht stornierte) Rechnungen laden, normalisiert, samt Retouren-Summe
 * je Rechnung (recordedReturnsByInvoice — dieselbe Quelle wie die offene-Posten-
 * Liste). Read-only, org-scoped über RLS. Mit `*` statt expliziter Spaltenliste,
 * damit die Abfrage auch dann trägt, falls die paid_at-Migration noch nicht
 * eingespielt ist (fehlende Spalte → undefined → als „nicht bezahlt").
 */
async function loadActiveInvoices(): Promise<NormInvoice[]> {
  const [invoicesRes, returnsByInvoice] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, dealer:dealers(zahlungsziel_tage)')
      .neq('status', 'cancelled'),
    recordedReturnsByInvoice(),
  ])

  if (invoicesRes.error) throw invoicesRes.error
  return ((invoicesRes.data ?? []) as unknown as RawInvoice[]).map((row) =>
    normalize(row, returnsByInvoice),
  )
}

interface Summary {
  invoiceCount: number
  openAmount: number
  overdueAmount: number
  overdueCount: number
  avgDelayDays: number | null
  paidCount: number
  refundOpen: number
}

/** Kern-Aggregation über eine Menge Rechnungen (org-weit oder je Händler). */
function summarize(rows: NormInvoice[], today: string): Summary {
  let openAmount = 0
  let overdueAmount = 0
  let overdueCount = 0
  let paidCount = 0
  let refundOpen = 0
  const delays: number[] = []

  for (const r of rows) {
    if (r.status === 'sent') {
      // Offener Rest = Rechnungsbrutto − recorded Retouren (zentral in
      // returnsCalc.openAfterReturns, nie unter 0). Voll gutgeschriebene
      // Rechnungen (Rest 0) zählen weder offen noch überfällig.
      const open = openAfterReturns(r.total, r.returnsTotal)
      if (open > 0) {
        openAmount += open
        if (r.dueIso && r.dueIso < today) {
          overdueAmount += open
          overdueCount += 1
        }
      }
    } else if (r.status === 'paid') {
      paidCount += 1
      if (r.paidAtIso && r.dueIso) {
        delays.push(daysBetween(r.paidAtIso, r.dueIso))
      }
      // Bezahlt + danach retourniert → Überzahlung ist rückzuerstatten (zentral
      // in refundCalc.refundDue, Skonto-korrekt). Getrennt von openAmount, das
      // umgekehrte Vorzeichen — nie dort hineingerechnet.
      refundOpen += refundDue(r.total, r.returnsTotal, r.paidAmount)
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
    refundOpen: Math.round(refundOpen * 100) / 100,
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
    refundOpen: s.refundOpen,
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
    refundTotal: s.refundOpen,
  }
}
