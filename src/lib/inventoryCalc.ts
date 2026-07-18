// Reine Bestandslogik — bewusst OHNE Supabase-Import, damit sie unter
// `node --test` (ohne Vite-Env) prüfbar ist (Muster wie itemKey.ts /
// returnsCalc.ts / commissionCalc.ts). Die datenbeschaffenden Funktionen liegen
// in inventory.ts und delegieren hierher.
//
// Ist-Bestand = SUMME der vorzeichenbehafteten Bewegungen je Dimension
// (product + variant + color + size + warehouse), KEIN Clamp: negativer Bestand
// (mehr aus- als eingebucht) ist ein echter Sachverhalt, den die App zeigt.
import { itemKey } from './itemKey.ts'
import type { MovementInput, Warehouse } from '../types/inventory.ts'

/** Das für die Bestandsrechnung Nötige einer Bewegung. */
export interface MovementLike {
  product_id: string
  variant_id: string | null
  color: string | null
  size: string | null
  warehouse: Warehouse
  /** Vorzeichenbehaftet: + Zugang, − Abgang. */
  menge: number
}

/** Ist-Bestand je Dimension inkl. Lager. */
export interface StockLine {
  product_id: string
  variant_id: string | null
  color: string | null
  size: string | null
  warehouse: Warehouse
  bestand: number
}

/** Ist-Bestand je Artikel-Dimension über beide Lager summiert (ohne warehouse). */
export interface ItemStockLine {
  product_id: string
  variant_id: string | null
  color: string | null
  size: string | null
  bestand: number
}

/** Eine Lieferposition, reduziert auf das für den Ausbuchungs-Vorschlag Nötige. */
export interface DeliveryItemLike {
  product_id: string
  color: string | null
  size: string | null
  quantity: number
}

/**
 * Dimensions-Schlüssel einer Bestandszeile: warehouse + variant + der neutrale
 * Positions-Schlüssel product/color/size (itemKey). Baut bewusst auf itemKey
 * auf, statt ihn neu zu erfinden — dieselbe product/color/size-Achse wie
 * deliveries/goodsReceipts.
 */
export function stockKey(
  product_id: string,
  variant_id: string | null,
  color: string | null,
  size: string | null,
  warehouse: Warehouse,
): string {
  return `${warehouse}||${variant_id ?? ''}||${itemKey(product_id, color, size)}`
}

/**
 * Ist-Bestand je Dimension (product+variant+color+size+warehouse) als Summe der
 * vorzeichenbehafteten Bewegungen. Kein Clamp (negativ möglich). Zeilen mit
 * Netto-Bestand 0 bleiben enthalten — die View inventory_stock verhält sich
 * genauso; die UI filtert bei Bedarf.
 */
export function currentStock(movements: MovementLike[]): StockLine[] {
  const map = new Map<string, StockLine>()
  for (const m of movements) {
    const key = stockKey(m.product_id, m.variant_id, m.color, m.size, m.warehouse)
    const line = map.get(key)
    if (line) {
      line.bestand += m.menge
    } else {
      map.set(key, {
        product_id: m.product_id,
        variant_id: m.variant_id,
        color: m.color,
        size: m.size,
        warehouse: m.warehouse,
        bestand: m.menge,
      })
    }
  }
  return [...map.values()]
}

/** Ist-Bestand nur eines Lagers (Filter + currentStock) — „je Lager". */
export function currentStockForWarehouse(
  movements: MovementLike[],
  warehouse: Warehouse,
): StockLine[] {
  return currentStock(movements.filter((m) => m.warehouse === warehouse))
}

/**
 * Ist-Bestand je Artikel-Dimension über BEIDE Lager summiert (warehouse
 * kollabiert) — „wie viel haben wir insgesamt von X, egal in welchem Lager".
 * Variante/Farbe/Größe trennen weiter.
 */
export function currentStockAcrossWarehouses(
  movements: MovementLike[],
): ItemStockLine[] {
  const map = new Map<string, ItemStockLine>()
  for (const m of movements) {
    const key = `${m.variant_id ?? ''}||${itemKey(m.product_id, m.color, m.size)}`
    const line = map.get(key)
    if (line) {
      line.bestand += m.menge
    } else {
      map.set(key, {
        product_id: m.product_id,
        variant_id: m.variant_id,
        color: m.color,
        size: m.size,
        bestand: m.menge,
      })
    }
  }
  return [...map.values()]
}

/**
 * Vorschlagsmengen für die Lieferschein-Ausbuchung: aus den Lieferpositionen je
 * Position (product/color/size) EIN Abgang mit NEGATIVER Menge. variant_id
 * bleibt bewusst null — die Automatik rät NIE eine Variante; die setzt der
 * Mitarbeiter bei der Bestätigung. Nullmengen werden übersprungen. Der Rückgabe-
 * wert wird NICHT gespeichert (das macht die Datenschicht nach Bestätigung).
 */
export function proposeDeliveryDischarge(
  deliveryId: string,
  items: DeliveryItemLike[],
  warehouse: Warehouse,
): MovementInput[] {
  // Positionen je product/color/size summieren (eine Bewegung je Position).
  const grouped = new Map<
    string,
    { product_id: string; color: string | null; size: string | null; qty: number }
  >()
  for (const it of items) {
    if (it.quantity <= 0) continue
    const key = itemKey(it.product_id, it.color, it.size)
    const g = grouped.get(key)
    if (g) {
      g.qty += it.quantity
    } else {
      grouped.set(key, {
        product_id: it.product_id,
        color: it.color,
        size: it.size,
        qty: it.quantity,
      })
    }
  }
  return [...grouped.values()].map((g) => ({
    product_id: g.product_id,
    variant_id: null, // Automatik rät NIE eine Variante
    color: g.color,
    size: g.size,
    warehouse,
    menge: -g.qty, // Abgang = negativ
    grund: 'lieferschein',
    delivery_id: deliveryId,
  }))
}
