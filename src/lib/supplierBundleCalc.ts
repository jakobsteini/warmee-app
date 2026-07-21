/**
 * Lieferanten-Order (Nepal-Sammelbestellung), Modul A — reiner Bündel-Kern.
 * Supabase-frei → unter `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 *
 * Aufgabe: aus den OFFENEN Positionen bestätigter Kunden-Aufträge (AB) je
 * Lieferant eine Sammelbestellung ableiten. „Offen" = noch in keiner
 * Sammelbestellung verbraucht (Quell-Link `supplier_order_sources`). Ein Artikel
 * hängt über producer_id an genau einem Lieferanten.
 *
 * Kein stiller Datenverlust: Positionen ohne producer_id werden NICHT still
 * verworfen, sondern getrennt (`missingProducer`) zurückgegeben — die Datenschicht
 * blockt damit hart und nennt die betroffenen Artikel.
 */

/** Eine offene AB-Position mit dem Lieferanten ihres Artikels. */
export interface BundleOrderItem {
  /** order_items.id — Quell-Verknüpfung für supplier_order_sources. */
  id: string
  product_id: string
  /** Lieferant des Artikels (products.producer_id); null = nicht zugeordnet. */
  producer_id: string | null
  /** Artikelname — nur für die Block-Meldung bei fehlendem Lieferanten. */
  product_name: string
  color: string | null
  size: string | null
  quantity: number
}

/** Eine aggregierte Bestellposition (Produkt + Farbe + Größe). */
export interface BundlePosition {
  product_id: string
  color: string | null
  size: string | null
  total: number
}

/** Eine Sammelbestellung je Lieferant. */
export interface ProducerBundle {
  producer_id: string
  positions: BundlePosition[]
  /** Verbrauchte order_items.id (für supplier_order_sources). */
  sourceItemIds: string[]
}

export interface BundleResult {
  byProducer: ProducerBundle[]
  /** Offene Positionen OHNE producer_id — Datenschicht blockt darauf. */
  missingProducer: BundleOrderItem[]
}

/** Interner Aggregations-Schlüssel je Position (Produkt/Farbe/Größe). */
function posKey(productId: string, color: string | null, size: string | null): string {
  return `${productId}||${color ?? ''}||${size ?? ''}`
}

/**
 * Bündelt die übergebenen AB-Positionen je Lieferant. Bereits verbrauchte
 * Positionen (`consumedIds`) werden übersprungen. Positionen ohne producer_id
 * landen in `missingProducer`. Ausgabe deterministisch sortiert (Lieferant nach
 * producer_id, Positionen nach Produkt/Farbe/Größe) — reproduzierbar für Tests.
 */
export function bundleOpenItems(
  items: BundleOrderItem[],
  consumedIds: Iterable<string> = [],
): BundleResult {
  const consumed = consumedIds instanceof Set ? consumedIds : new Set(consumedIds)

  const missingProducer: BundleOrderItem[] = []
  // producer_id → (posKey → aggregierte Position) + verbrauchte Quell-IDs.
  const byProducer = new Map<
    string,
    { positions: Map<string, BundlePosition>; sourceItemIds: string[] }
  >()

  for (const it of items) {
    if (consumed.has(it.id)) continue // schon verbraucht → nicht mehr offen
    if (it.producer_id == null) {
      missingProducer.push(it)
      continue
    }
    let group = byProducer.get(it.producer_id)
    if (!group) {
      group = { positions: new Map(), sourceItemIds: [] }
      byProducer.set(it.producer_id, group)
    }
    const key = posKey(it.product_id, it.color, it.size)
    const existing = group.positions.get(key)
    if (existing) existing.total += it.quantity ?? 0
    else
      group.positions.set(key, {
        product_id: it.product_id,
        color: it.color,
        size: it.size,
        total: it.quantity ?? 0,
      })
    group.sourceItemIds.push(it.id)
  }

  const sortPos = (a: BundlePosition, b: BundlePosition) =>
    a.product_id.localeCompare(b.product_id) ||
    (a.color ?? '').localeCompare(b.color ?? '') ||
    (a.size ?? '').localeCompare(b.size ?? '')

  const bundles: ProducerBundle[] = [...byProducer.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([producer_id, g]) => ({
      producer_id,
      positions: [...g.positions.values()].sort(sortPos),
      sourceItemIds: g.sourceItemIds,
    }))

  return { byProducer: bundles, missingProducer }
}

/** Distinct-Artikelnamen der Positionen ohne Lieferant (für die Block-Meldung). */
export function missingProducerArticleNames(result: BundleResult): string[] {
  const seen = new Set<string>()
  for (const it of result.missingProducer) {
    if (!seen.has(it.product_name)) seen.add(it.product_name)
  }
  return [...seen]
}
