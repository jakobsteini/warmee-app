/**
 * Mögliche Status einer Produktionsbestellung (englisch gespeichert, wie in der
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

/** Nächster Status im Flow, oder null wenn bereits „Erhalten". */
export function nextProductionStatus(
  status: ProductionStatus,
): ProductionStatus | null {
  const idx = PRODUCTION_STATUSES.indexOf(status)
  return idx >= 0 && idx < PRODUCTION_STATUSES.length - 1
    ? PRODUCTION_STATUSES[idx + 1]
    : null
}

/** Eine Produktionsbestellung (snake_case wie in der DB). */
export interface ProductionOrder {
  id: string
  org_id: string
  season_id: string
  /** Produzent (Nepal, Portugal, …). Nullable, bis die Zuordnung erfolgt. */
  producer_id: string | null
  status: ProductionStatus
  generated_at: string | null
  sent_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string | null
}

/**
 * Produktionsbestellung für die Übersichtsseite: mit Saison-Label,
 * Produzentenname und der Anzahl der Positionen (aggregierte Zeilen).
 */
export interface ProductionOrderListRow extends ProductionOrder {
  season: { label: string } | null
  producer: { name: string } | null
  production_order_items: { total_quantity: number }[]
}

/** Eine aggregierte Position (snake_case wie in der DB). */
export interface ProductionOrderItem {
  id: string
  production_order_id: string
  /** Nullable: Positionen ohne Katalog-Treffer (z. B. Nepal-Import) haben keinen Artikel. */
  product_id: string | null
  color: string | null
  size: string | null
  total_quantity: number
  created_at: string | null
  // ─── Positions-Felder aus dem Produzenten-Import (alle nullable) ─────────
  modell: string | null
  modell_description: string | null
  quality: string | null
  color_description: string | null
  group_name: string | null
  /** numeric(10,2) – kann als number oder string ankommen. */
  price_per_piece: number | string | null
  whole_price: number | string | null
}

/** Position inkl. mitgeladenem Produkt (für die Detailansicht). */
export interface ProductionOrderItemWithProduct extends ProductionOrderItem {
  product: { name: string } | null
}
