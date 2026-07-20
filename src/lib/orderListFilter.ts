// Reine Order-Listen-Filterung — supabase-frei, unter `node --test` prüfbar
// (Muster wie orderCalc.ts / commissionCalc.ts). Filtert eine bereits geladene,
// org-scoped Liste client-seitig. Generisch über eine MINIMALE Struktur, damit
// jede OrderListRow passt und die Tests schlank bleiben.

/** Das für die Filterung Nötige einer Order-Zeile. */
export interface FilterableOrder {
  season_id: string
  dealer_id: string
  assignment: string
}

/** Aktive Filter; leerer/fehlender Wert = kein Filter auf dieser Achse. */
export interface OrderListFilter {
  seasonId?: string
  dealerId?: string
  assignment?: string
}

/**
 * Orders nach Saison, Kunde und Zuordnung (assignment) filtern. Jede Achse ist
 * optional — ein leerer Wert lässt sie offen. UND-Verknüpfung über die Achsen.
 */
export function filterOrders<T extends FilterableOrder>(
  orders: readonly T[],
  f: OrderListFilter,
): T[] {
  return orders.filter(
    (o) =>
      (!f.seasonId || o.season_id === f.seasonId) &&
      (!f.dealerId || o.dealer_id === f.dealerId) &&
      (!f.assignment || o.assignment === f.assignment),
  )
}
