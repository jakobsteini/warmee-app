// Reine Order-Listen-Filterung — supabase-frei, unter `node --test` prüfbar
// (Muster wie orderCalc.ts / commissionCalc.ts). Filtert eine bereits geladene,
// org-scoped Liste client-seitig. Generisch über eine MINIMALE Struktur, damit
// jede OrderListRow passt und die Tests schlank bleiben.

/** Das für die Filterung Nötige einer Order-Zeile. */
export interface FilterableOrder {
  season_id: string
  dealer_id: string
  assignment: string
  priority: boolean
}

/** Aktive Filter; leerer/fehlender Wert = kein Filter auf dieser Achse. */
export interface OrderListFilter {
  seasonId?: string
  dealerId?: string
  assignment?: string
  /** true = nur priorisierte Orders; false/undefined = alle. */
  priorityOnly?: boolean
}

/**
 * Orders nach Saison, Kunde, Zuordnung (assignment) und Priorität filtern. Jede
 * Achse ist optional — ein leerer/false Wert lässt sie offen. UND-Verknüpfung.
 */
export function filterOrders<T extends FilterableOrder>(
  orders: readonly T[],
  f: OrderListFilter,
): T[] {
  return orders.filter(
    (o) =>
      (!f.seasonId || o.season_id === f.seasonId) &&
      (!f.dealerId || o.dealer_id === f.dealerId) &&
      (!f.assignment || o.assignment === f.assignment) &&
      (!f.priorityOnly || o.priority === true),
  )
}
