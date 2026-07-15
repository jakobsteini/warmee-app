/**
 * Wareneingang — reale Eingangsmengen je Produktionsbestellung. Es kann mehrere
 * Wareneingänge (Teillieferungen) je Produktionsbestellung geben; die
 * Eingangsmenge einer Position ist die Summe über alle Wareneingänge.
 */

/** Ein Wareneingang-Kopf (snake_case wie in der DB). */
export interface GoodsReceipt {
  id: string
  org_id: string
  production_order_id: string
  received_date: string
  notes: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/** Eine erfasste Eingangsmenge, angehängt an eine Nepal-Position. */
export interface GoodsReceiptItem {
  id: string
  goods_receipt_id: string
  production_order_item_id: string
  quantity: number
  created_at: string | null
}

/** Wareneingang-Kopf inkl. Positionen (für die Liste je Produktionsbestellung). */
export interface GoodsReceiptWithItems extends GoodsReceipt {
  goods_receipt_items: GoodsReceiptItem[]
}

/** Eingabezeile beim Erfassen eines Wareneingangs. */
export interface ReceiptItemInput {
  production_order_item_id: string
  quantity: number
}

/**
 * Eine Zeile des Abgleichs Wareneingang ↔ Warenverteilung, je Nepal-Position:
 *   bestellt (bei Nepal) → eingegangen (real) → verteilt (an Händler).
 * `distributed` ist über den Positions-Schlüssel (Produkt/Farbe/Größe) aus allen
 * Lieferungen der Produktionsbestellung summiert. Für Positionen ohne
 * Katalog-Treffer (product_id = null) ist `distributed` immer 0.
 */
export interface ReconciliationRow {
  production_order_item_id: string
  product_id: string | null
  productName: string
  color: string | null
  size: string | null
  /** Bei Nepal bestellt (production_order_items.total_quantity). */
  ordered: number
  /** Real eingegangen (Summe über alle Wareneingänge). */
  received: number
  /** An Händler verteilt (Summe der delivery_items über denselben Schlüssel). */
  distributed: number
}

/**
 * Fehlmenge einer Position beim Generieren der Verteilung: es sollen mehr Stück
 * verteilt werden (Kundenorders) als real eingegangen sind. Die eigentliche
 * Information bei Knappheit — Theresa muss dann von Hand entscheiden, wer
 * weniger bekommt (prioritätsbasierte Zuteilung ist noch nicht gebaut).
 */
export interface DistributionShortfall {
  productName: string
  color: string | null
  size: string | null
  /** Von Kunden bestellt (was verteilt werden soll). */
  ordered: number
  /** Real eingegangen. */
  received: number
  /** Fehlmenge = ordered − received (> 0). */
  gap: number
}
