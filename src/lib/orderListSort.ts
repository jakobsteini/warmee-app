// Reine Order-Listen-Sortierung — supabase-frei, unter `node --test` prüfbar.
// Sortiert nach Saison-Label, Kundenname, Zuordnung oder Lieferdatum-Von.
// Generisch über eine MINIMALE Struktur (jede OrderListRow passt).

/** Das für die Sortierung Nötige einer Order-Zeile. */
export interface SortableOrder {
  assignment: string
  /** ISO-Datum oder null (Lieferzeitraum von). */
  delivery_date_from: string | null
  season: { label: string } | null
  dealer: { name: string } | null
}

/** Sortierbare Spalten. */
export type OrderSortKey = 'season' | 'dealer' | 'assignment' | 'delivery_from'
export type SortDir = 'asc' | 'desc'

/** Vergleichswert je Spalte als String ('' = leer/kein Wert). */
function sortValue(o: SortableOrder, key: OrderSortKey): string {
  switch (key) {
    case 'season':
      return o.season?.label ?? ''
    case 'dealer':
      return o.dealer?.name ?? ''
    case 'assignment':
      return o.assignment ?? ''
    case 'delivery_from':
      return o.delivery_date_from ?? ''
  }
}

/**
 * Orders nach `key` sortieren. Leere Werte landen IMMER am Ende (unabhängig von
 * der Richtung) — sonst stünden Orders ohne Lieferdatum bei absteigend vorn.
 * Nicht-mutierend (kopiert). ISO-Kurzdaten sind lexikografisch = chronologisch.
 */
export function sortOrders<T extends SortableOrder>(
  orders: readonly T[],
  key: OrderSortKey,
  dir: SortDir,
): T[] {
  const factor = dir === 'desc' ? -1 : 1
  return [...orders].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    if (av === '' && bv === '') return 0
    if (av === '') return 1
    if (bv === '') return -1
    return factor * av.localeCompare(bv, 'de')
  })
}
