/**
 * Mögliche Status einer Lieferung/Verteilung (englisch gespeichert, wie in der
 * DB-Check-Constraint). Status-Flow: Ausstehend → Verpackt → Versendet →
 * Geliefert.
 */
export const DELIVERY_STATUSES = [
  'pending',
  'packed',
  'shipped',
  'delivered',
] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/** Deutsche UI-Labels für die Status. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Ausstehend',
  packed: 'Verpackt',
  shipped: 'Versendet',
  delivered: 'Geliefert',
}

export function deliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABELS[status as DeliveryStatus] ?? status
}

/** Nächster Status im Flow, oder null wenn bereits „Geliefert". */
export function nextDeliveryStatus(
  status: DeliveryStatus,
): DeliveryStatus | null {
  const idx = DELIVERY_STATUSES.indexOf(status)
  return idx >= 0 && idx < DELIVERY_STATUSES.length - 1
    ? DELIVERY_STATUSES[idx + 1]
    : null
}

/** Eine Lieferung (snake_case wie in der DB). */
export interface Delivery {
  id: string
  org_id: string
  production_order_id: string
  dealer_id: string
  status: DeliveryStatus
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Lieferung für die Übersichtsseite: mit Händlername, Saison-Label (über die
 * Nepal-Bestellung) und den Positions-Stückzahlen zum Aufsummieren.
 */
export interface DeliveryListRow extends Delivery {
  dealer: { name: string } | null
  production_order: { season_id: string; season: { label: string } | null } | null
  delivery_items: { quantity: number }[]
}

/** Eine Lieferposition (snake_case wie in der DB). */
export interface DeliveryItem {
  id: string
  delivery_id: string
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  created_at: string | null
}

/** Lieferposition inkl. mitgeladenem Produktnamen (für die Detailansicht). */
export interface DeliveryItemWithProduct extends DeliveryItem {
  product: { name: string } | null
}

/**
 * Eine Zeile des Soll/Ist-Abgleichs: bestellte Menge (aus der originalen Order
 * des Händlers) gegenüber der zu liefernden Menge (editierbar).
 */
export interface DeliveryComparisonRow {
  item: DeliveryItemWithProduct
  /** Ursprünglich bestellte Menge dieser Kombination Produkt/Farbe/Größe. */
  ordered: number
}
