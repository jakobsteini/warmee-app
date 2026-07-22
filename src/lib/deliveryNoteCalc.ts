/**
 * Reiner Rechenkern für den Lieferschein (supabase-frei, unter `node --test`
 * importierbar). Einzige Quelle für die Ableitung der PDF-Positionen und der
 * Gesamtmenge aus den eingefrorenen Lieferschein-Positionen — damit Seite und
 * PDF-Erzeugung dieselbe Logik nutzen.
 */

/** Minimalform einer eingefrorenen Lieferschein-Position. */
export interface NoteItemLike {
  description: string
  color: string | null
  size: string | null
  quantity: number
}

/** Beleg-Position (Form der PDF-BelegItems, ohne Preise). */
export interface DeliveryNoteBelegItem {
  description: string
  color: string | null
  size: string | null
  quantity: number
}

/** Eingefrorene Positionen → PDF-Positionen (nur Belegfelder). */
export function belegItemsFromNoteItems(
  items: NoteItemLike[],
): DeliveryNoteBelegItem[] {
  return items.map((i) => ({
    description: i.description,
    color: i.color,
    size: i.size,
    quantity: i.quantity,
  }))
}

/** Gesamtstückzahl eines Lieferscheins. */
export function deliveryNoteTotalQuantity(
  items: { quantity: number }[],
): number {
  return items.reduce((sum, i) => sum + (i.quantity || 0), 0)
}
