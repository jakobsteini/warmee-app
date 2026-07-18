/**
 * Lager — Bewegungskonto. Der Ist-Bestand ist kein gespeichertes Feld, sondern
 * die Summe der vorzeichenbehafteten Bewegungen (View inventory_stock). Siehe
 * Migration 20260718120000_inventory_movements.sql.
 */

/** Die zwei Lager (englisch gespeichert wie in der DB-Check-Constraint). */
export const WAREHOUSES = ['online', 'bestand'] as const
export type Warehouse = (typeof WAREHOUSES)[number]

/**
 * Grund/Anlass einer Bestandsbewegung (englisch gespeichert). 'umlagerung' ist
 * für die spätere Lager-zu-Lager-Umbuchung im CHECK erlaubt, hat aber noch keine
 * Logik/UI.
 */
export const INVENTORY_GRUENDE = [
  'manuell',
  'lieferschein',
  'korrektur',
  'umlagerung',
] as const
export type InventoryGrund = (typeof INVENTORY_GRUENDE)[number]

/** Eine Bestandsbewegung (snake_case wie in der DB). Append-only. */
export interface InventoryMovement {
  id: string
  org_id: string
  product_id: string
  variant_id: string | null
  color: string | null
  size: string | null
  warehouse: Warehouse
  /** Vorzeichenbehaftet: + Zugang, − Abgang. Nie 0 (DB-Check). */
  menge: number
  grund: InventoryGrund
  /** Gesetzt bei grund='lieferschein' (Anker der Ein-Klick-Ausbuchung). */
  delivery_id: string | null
  created_by: string | null
  created_at: string | null
}

/**
 * Eingabe zum Erfassen einer Bewegung. org_id/created_by setzt die Datenschicht;
 * die optionalen Felder werden dort auf null normalisiert.
 */
export interface MovementInput {
  product_id: string
  variant_id?: string | null
  color?: string | null
  size?: string | null
  warehouse: Warehouse
  menge: number
  grund: InventoryGrund
  delivery_id?: string | null
}

/** Eine Zeile der View inventory_stock: Ist-Bestand je Dimension (inkl. Lager). */
export interface InventoryStockRow {
  product_id: string
  variant_id: string | null
  color: string | null
  size: string | null
  warehouse: Warehouse
  /** Summe der Bewegungen; vorzeichenbehaftet, kein Clamp (negativ möglich). */
  bestand: number
}
