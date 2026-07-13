import { supabase } from './supabase'
import { getMoneySnapshot, type MoneySnapshot } from './creditRating'

// ============================================================================
// Auswertungs-Daten für das Dashboard. Rein Read, org-scoped über RLS.
//
// Umsatz = Summe der BESTÄTIGTEN Kundenorders (status='confirmed'), netto je
// Position: quantity × (order_items.unit_price, ersatzweise product.wholesale_price).
// Das spiegelt die tatsächlich gebuchten Verkäufe; unbestätigte Entwürfe zählen
// nicht. Der Saison-Filter wirkt auf diesen Umsatz-Teil.
//
// Die Geld-Kennzahlen (offen/überfällig/Zahlungsmoral) sind ein Live-Snapshot
// über alle aktiven Rechnungen (saison-unabhängig, siehe getMoneySnapshot).
// ============================================================================

/** Eine Aufschlüsselungszeile (Balkenliste). */
export interface RevenueRow {
  label: string
  amount: number
  /** Optional: Stückzahl (nur bei Artikeln gefüllt). */
  qty?: number
}

export interface AnalyticsData {
  totalRevenue: number
  bySeason: RevenueRow[]
  byDealer: RevenueRow[]
  byRegion: RevenueRow[]
  byProduct: RevenueRow[]
  money: MoneySnapshot
}

/** Wie viele Zeilen die Top-Listen (Händler, Artikel) maximal zeigen. */
const TOP_N = 8

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Rohzeilen aus der Orders-Abfrage. */
interface RawOrder {
  season_id: string
  dealer: {
    name: string
    billing_country_name: string | null
    shipping_country_name: string | null
    country: string | null
  } | null
  season: { label: string } | null
  order_items: {
    quantity: number
    unit_price: number | string | null
    product: { name: string; wholesale_price: number | string | null } | null
  }[]
}

/** In eine Summen-Map einsortieren (Betrag + optional Menge). */
function add(
  map: Map<string, { amount: number; qty: number }>,
  key: string,
  amount: number,
  qty: number,
) {
  const cur = map.get(key)
  if (cur) {
    cur.amount += amount
    cur.qty += qty
  } else {
    map.set(key, { amount, qty })
  }
}

/** Map → sortierte RevenueRow-Liste (absteigend nach Betrag), optional gekappt. */
function toRows(
  map: Map<string, { amount: number; qty: number }>,
  opts: { top?: number; withQty?: boolean } = {},
): RevenueRow[] {
  const rows = [...map.entries()]
    .map(([label, v]) => ({
      label,
      amount: v.amount,
      ...(opts.withQty ? { qty: v.qty } : {}),
    }))
    .sort((a, b) => b.amount - a.amount)
  return opts.top ? rows.slice(0, opts.top) : rows
}

/**
 * Auswertungs-Daten laden. `seasonId` = 'all' oder eine konkrete Saison-ID
 * (wirkt nur auf den Umsatz-Teil). Read-only, RLS scoped die Org automatisch.
 */
export async function getAnalytics(
  seasonId: string | 'all',
): Promise<AnalyticsData> {
  let query = supabase
    .from('orders')
    .select(
      'season_id, dealer:dealers(name, billing_country_name, shipping_country_name, country), season:seasons(label), order_items(quantity, unit_price, product:products(name, wholesale_price))',
    )
    .eq('status', 'confirmed')

  if (seasonId !== 'all') query = query.eq('season_id', seasonId)

  const [ordersRes, money] = await Promise.all([query, getMoneySnapshot()])
  if (ordersRes.error) throw ordersRes.error

  const orders = (ordersRes.data ?? []) as unknown as RawOrder[]

  let totalRevenue = 0
  const seasonMap = new Map<string, { amount: number; qty: number }>()
  const dealerMap = new Map<string, { amount: number; qty: number }>()
  const regionMap = new Map<string, { amount: number; qty: number }>()
  const productMap = new Map<string, { amount: number; qty: number }>()

  for (const o of orders) {
    const dealerName = o.dealer?.name ?? 'Unbekannt'
    const seasonLabel = o.season?.label ?? '—'
    const region =
      o.dealer?.billing_country_name ??
      o.dealer?.shipping_country_name ??
      o.dealer?.country ??
      'Unbekannt'

    for (const it of o.order_items ?? []) {
      const qty = it.quantity ?? 0
      const price =
        it.unit_price != null && it.unit_price !== ''
          ? num(it.unit_price)
          : num(it.product?.wholesale_price)
      const amount = qty * price
      if (amount === 0 && qty === 0) continue

      totalRevenue += amount
      add(seasonMap, seasonLabel, amount, qty)
      add(dealerMap, dealerName, amount, qty)
      add(regionMap, region, amount, qty)
      add(productMap, it.product?.name ?? 'Unbekannt', amount, qty)
    }
  }

  return {
    totalRevenue,
    bySeason: toRows(seasonMap),
    byDealer: toRows(dealerMap, { top: TOP_N }),
    byRegion: toRows(regionMap),
    byProduct: toRows(productMap, { top: TOP_N, withQty: true }),
    money,
  }
}
