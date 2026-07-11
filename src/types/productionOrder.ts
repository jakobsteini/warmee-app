/**
 * Mögliche Status einer Nepal-Bestellung (englisch gespeichert, wie in der
 * DB-Check-Constraint). Status-Flow: Entwurf → Gesendet → In Produktion →
 * Versendet → Erhalten.
 */
export const PRODUCTION_STATUSES = [
  'draft',
  'sent',
  'in_production',
  'shipped',
  'received',
] as const
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number]

/** Deutsche UI-Labels für die Status. */
export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  draft: 'Entwurf',
  sent: 'Gesendet',
  in_production: 'In Produktion',
  shipped: 'Versendet',
  received: 'Erhalten',
}

export function productionStatusLabel(status: string): string {
  return PRODUCTION_STATUS_LABELS[status as ProductionStatus] ?? status
}

/**
 * Nächster Status im Flow, oder null wenn bereits „Erhalten".
 */
export function nextProductionStatus(
  status: ProductionStatus,
): ProductionStatus | null {
  const idx = PRODUCTION_STATUSES.indexOf(status)
  return idx >= 0 && idx < PRODUCTION_STATUSES.length - 1
    ? PRODUCTION_STATUSES[idx + 1]
    : null
}

/** Eine Nepal-Bestellung (snake_case wie in der DB). */
export interface ProductionOrder {
  id: string
  org_id: string
  season_id: string
  status: ProductionStatus
  generated_at: string | null
  sent_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string | null
}

/**
 * Nepal-Bestellung für die Übersichtsseite: mit Saison-Label und der Anzahl
 * der Positionen (aggregierte Zeilen).
 */
export interface ProductionOrderListRow extends ProductionOrder {
  season: { label: string } | null
  production_order_items: { total_quantity: number }[]
}

/** Eine aggregierte Position (snake_case wie in der DB). */
export interface ProductionOrderItem {
  id: string
  production_order_id: string
  product_id: string
  color: string | null
  size: string | null
  total_quantity: number
  created_at: string | null
}

/** Position inkl. mitgeladenem Produkt (für die Detailansicht). */
export interface ProductionOrderItemWithProduct extends ProductionOrderItem {
  product: { name: string } | null
}
