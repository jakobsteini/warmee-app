import { getDealer } from './dealers'
import { listOrders } from './orders'
import { listInvoices } from './invoices'
import { listOpenPayments } from './openPayments'
import { listDeliveries } from './deliveries'
import { listDealerEmails } from './dealerEmails'
import { listDealerPriorities } from './dealerPriorities'
import { listDealerDocuments } from './dealerDocuments'
import { listSeasons } from './seasons'
import { listDunningLevels, reachedLevel } from './dunning'
import { listDealerCredits, type DealerCredit } from './creditRating'
import { daysOverdue, faelligkeitIso, todayIso } from './dueDates'
import type { Dealer } from '../types/dealer'
import type { OrderListRow } from '../types/order'
import type { InvoiceListRow } from '../types/invoice'
import type { DeliveryListRow } from '../types/delivery'
import type { DealerEmail } from '../types/dealerEmail'
import type { DealerDocument } from '../types/dealerDocument'
import type { DunningLevel } from '../types/dunning'

// ============================================================================
// 360°-Datenblick eines Händlers. BEWUSST reine Komposition der bestehenden
// Bildschirm-Quellen (wie beim Kommissionierschein / dueDates) — KEINE zweite
// Berechnung von Bonität oder Fälligkeit. Geld/Ampel kommen aus creditRating,
// Fälligkeit/Überfälligkeit aus dueDates, die Mahnstufe aus reachedLevel.
// Alles read-only, org-scoped über RLS. Jede Quelle degradiert einzeln (der
// Aufrufer fängt sie ab), damit ein fehlender Teilbereich die Seite nicht
// blockiert.
// ============================================================================

/** Eine offene (versendete) Rechnung des Händlers mit Überfälligkeit + Stufe. */
export interface DealerOpenItem {
  invoice: InvoiceListRow
  /** Fälligkeitsdatum (ISO) laut gemeinsamer dueDates-Logik. */
  faelligIso: string | null
  /** Tage überfällig (> 0) oder null, wenn (noch) nicht überfällig. */
  daysOverdue: number | null
  /** Höchste erreichte Mahnstufe, oder null. */
  level: DunningLevel | null
}

/** Eine Saison-Priorität des Händlers, angereichert um das Saison-Label. */
export interface DealerPriorityRow {
  seasonId: string
  seasonLabel: string
  isActive: boolean
  priority: number
}

/** Alles, was die Kundendetailseite zeigt. */
export interface DealerDetailData {
  dealer: Dealer
  credit: DealerCredit | undefined
  orders: OrderListRow[]
  invoices: InvoiceListRow[]
  openItems: DealerOpenItem[]
  deliveries: DeliveryListRow[]
  emails: DealerEmail[]
  priorities: DealerPriorityRow[]
  documents: DealerDocument[]
  /** Umsatz = Summe der nicht stornierten Rechnungsbeträge dieses Händlers. */
  revenueTotal: number
}

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/**
 * Alle Detaildaten eines Händlers laden. Die org-weiten Listen (Orders,
 * Rechnungen, Lieferungen, Bonität) werden einmal parallel geholt und im
 * Speicher nach dealer_id gefiltert — bei 128 Händlern und einigen hundert
 * Belegen ist das unkritisch und spart eigene Abfragen/Indizes.
 */
export async function loadDealerDetail(id: string): Promise<DealerDetailData> {
  const [
    dealer,
    creditMap,
    orders,
    invoices,
    openPayments,
    deliveries,
    emails,
    priorities,
    documents,
    seasons,
    levels,
  ] = await Promise.all([
    getDealer(id),
    listDealerCredits().catch(() => new Map<string, DealerCredit>()),
    listOrders().catch(() => []),
    listInvoices().catch(() => []),
    listOpenPayments().catch(() => []),
    listDeliveries().catch(() => []),
    listDealerEmails(id).catch(() => []),
    listDealerPriorities(id).catch(() => []),
    listDealerDocuments(id).catch(() => []),
    listSeasons().catch(() => []),
    listDunningLevels().catch(() => []),
  ])

  const dealerOrders = orders.filter((o) => o.dealer_id === id)
  const dealerInvoices = invoices.filter((inv) => inv.dealer_id === id)
  const dealerDeliveries = deliveries.filter((d) => d.dealer_id === id)

  // Offene Posten: dieselbe Quelle wie die globale Liste (versendet + Zahlungs-
  // ziel-Join), gefiltert auf den Händler. Überfälligkeit/Stufe über dueDates +
  // reachedLevel — keine eigene Rechnung.
  const today = todayIso()
  const openItems: DealerOpenItem[] = openPayments
    .filter((inv) => inv.dealer_id === id)
    .map((invoice) => {
      const days = daysOverdue(invoice, today)
      return {
        invoice,
        faelligIso: faelligkeitIso(invoice),
        daysOverdue: days,
        level: days !== null ? reachedLevel(days, levels) : null,
      }
    })

  // Saison-Prioritäten um Label/Aktiv-Flag anreichern; aktive Saison zuerst,
  // dann nach Prioritätswert (kleiner = höher).
  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const priorityRows: DealerPriorityRow[] = priorities
    .map((p) => {
      const season = seasonById.get(p.season_id)
      return {
        seasonId: p.season_id,
        seasonLabel: season?.label ?? p.season_id,
        isActive: !!season?.is_active,
        priority: p.priority,
      }
    })
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || a.priority - b.priority,
    )

  // „Fakturiert" = tatsächlich ausgestellt (versendet oder bezahlt); Entwürfe
  // und Stornos zählen nicht mit.
  const revenueTotal = dealerInvoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'paid')
    .reduce((sum, inv) => sum + num(inv.total), 0)

  return {
    dealer,
    credit: creditMap.get(id),
    orders: dealerOrders,
    invoices: dealerInvoices,
    openItems,
    deliveries: dealerDeliveries,
    emails,
    priorities: priorityRows,
    documents,
    revenueTotal,
  }
}
