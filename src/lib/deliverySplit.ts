/**
 * Order→Lieferung-Split (Session 1) — reiner Rechenkern, supabase-frei → unter
 * `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 *
 * Kundenentscheidung (Weg A): Lieferungen entstehen JE ORDER. Aus den Roh-
 * Verteilzeilen (je Position, mit ihrer Order + deren Händler) wird pro Order
 * EINE Lieferung gebildet — ein Händler mit mehreren Orders bekommt mehrere
 * Lieferungen, der order_id-Link ist damit immer eindeutig.
 *
 * HARD-BLOCK statt stiller NULL: lässt sich eine Position mit Menge > 0 keiner
 * eindeutigen Order+Händler zuordnen (orderId oder dealerId fehlt), liefert der
 * Kern `{ ok: false, unresolved }`. Der Aufrufer wirft dann einen sichtbaren
 * Fehler, statt eine Lieferung ohne order_id anzulegen (kein Raten, kein stiller
 * Datenverlust).
 */

/** Eine Roh-Verteilzeile: eine Position aus einem Kunden-Auftrag. */
export interface SplitRow {
  /** Ursprungs-Order der Position (order_items.order_id bzw. Snapshot). */
  orderId: string | null
  /** Händler dieser Order. */
  dealerId: string | null
  productId: string | null
  color: string | null
  size: string | null
  quantity: number
}

/** Eine aggregierte Lieferposition (Produkt/Farbe/Größe + Menge). */
export interface SplitPosition {
  product_id: string | null
  color: string | null
  size: string | null
  total: number
}

/** Eine Lieferung je Order: Order + deren Händler + Positionen. */
export interface DeliveryGroup {
  orderId: string
  dealerId: string
  positions: Map<string, SplitPosition>
}

export type SplitResult =
  | { ok: true; deliveries: DeliveryGroup[] }
  | { ok: false; unresolved: number }

/** Positions-Schlüssel (identisch zu itemKey: Produkt||Farbe||Größe). */
function posKey(productId: string | null, color: string | null, size: string | null): string {
  return `${productId ?? ''}||${color ?? ''}||${size ?? ''}`
}

/**
 * Gruppiert die Positionen (Menge > 0) je Order zu einer Lieferung. 0-Mengen
 * werden übersprungen (keine Lieferzeile). Kann eine Position mit Menge > 0 keiner
 * Order+Händler zugeordnet werden → `{ ok: false, unresolved }` (Hard-Block).
 * Deterministisch: Reihenfolge der Lieferungen = Reihenfolge des ersten Auftretens
 * der Order in `rows`.
 */
export function splitByOrder(rows: SplitRow[]): SplitResult {
  let unresolved = 0
  const byOrder = new Map<string, DeliveryGroup>()
  for (const r of rows) {
    const qty = r.quantity ?? 0
    if (qty <= 0) continue
    if (!r.orderId || !r.dealerId) {
      unresolved++
      continue
    }
    let g = byOrder.get(r.orderId)
    if (!g) {
      g = { orderId: r.orderId, dealerId: r.dealerId, positions: new Map() }
      byOrder.set(r.orderId, g)
    }
    const key = posKey(r.productId, r.color, r.size)
    const existing = g.positions.get(key)
    if (existing) existing.total += qty
    else
      g.positions.set(key, {
        product_id: r.productId,
        color: r.color,
        size: r.size,
        total: qty,
      })
  }
  if (unresolved > 0) return { ok: false, unresolved }
  return { ok: true, deliveries: [...byOrder.values()] }
}
