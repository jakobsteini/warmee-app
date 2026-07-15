/** Mögliche Order-Status (englisch gespeichert, wie in der DB-Check-Constraint). */
export const ORDER_STATUSES = ['draft', 'submitted', 'confirmed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Zuteilung einer Order (Grundlage der Provision): der deutschen Agentin
 * (provisionsrelevant) oder WARM ME intern (keine Provision). Englisch/snake_case
 * wie die DB-Check-Constraint.
 */
export const ORDER_ASSIGNMENTS = ['agent', 'internal'] as const
export type OrderAssignment = (typeof ORDER_ASSIGNMENTS)[number]

/** Deutsche UI-Labels für die Status. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Entwurf',
  submitted: 'Eingereicht',
  confirmed: 'Bestätigt',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrderStatus] ?? status
}

/**
 * Status-Reihenfolge Entwurf → Eingereicht → Bestätigt.
 * Gibt den nächsten Status zurück, oder null wenn bereits bestätigt.
 */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const idx = ORDER_STATUSES.indexOf(status)
  return idx >= 0 && idx < ORDER_STATUSES.length - 1
    ? ORDER_STATUSES[idx + 1]
    : null
}

/** Eine Order-Zeile (snake_case wie in der DB). */
export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  /** numeric(10,2) – kann als number oder string ankommen. */
  unit_price: number | string | null
  created_at: string | null
}

/** Order-Zeile inkl. mitgeladenem Produkt (für die Bearbeitungsseite). */
export interface OrderItemWithProduct extends OrderItem {
  product: { name: string; color: string[] | null } | null
}

/** Felder zum Anlegen einer Order-Zeile (order_id/id kommen separat). */
export interface OrderItemInput {
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  unit_price: number | null
}

/** Eine Order (snake_case wie in der DB). */
export interface Order {
  id: string
  org_id: string
  dealer_id: string
  season_id: string
  status: OrderStatus
  /** Provisions-Zuteilung; NOT NULL DEFAULT 'internal' in der DB. */
  assignment: OrderAssignment
  notes: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Order für die Übersichtsseite: mit Händlername, Saison-Label und den
 * Zeilen-Beträgen zum Aufsummieren.
 */
export interface OrderListRow extends Order {
  dealer: { name: string } | null
  season: { label: string } | null
  order_items: { quantity: number; unit_price: number | string | null }[]
}

/** Felder zum Anlegen einer neuen Order. */
export interface OrderInput {
  dealer_id: string
  season_id: string
  assignment: OrderAssignment
  notes: string | null
}

/** Summe einer Zeile (Menge × Einzelpreis), robust gegen numeric-Strings. */
export function lineTotal(
  quantity: number,
  unit_price: number | string | null,
): number {
  const price =
    unit_price === null || unit_price === ''
      ? 0
      : typeof unit_price === 'string'
        ? Number(unit_price)
        : unit_price
  if (Number.isNaN(price)) return 0
  return quantity * price
}
