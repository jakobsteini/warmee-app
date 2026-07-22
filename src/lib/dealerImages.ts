// ============================================================================
// Rechenkern: Bildmaterial je Händler (Teil A).
//
// SUPABASE-FREI — testbar unter `node --test` (kein Vite, kein import.meta.env).
// Die datenbeschaffende Funktion liegt in assets.ts (listDealerOrderedImages)
// und delegiert an diese reinen Funktionen (siehe KONVENTIONEN → Rechenkerne).
//
// Fachlich: Der Händler bekommt NUR die Bilder zu den Artikeln, die ER bestellt
// hat — nicht das ganze Saison-Bildmaterial. Ableitung:
//   Order-Positionen des Händlers → distinct product_id → Bilder mit dieser
//   product_id (Duplikate raus, deterministisch sortiert).
// ============================================================================

import type { AssetProductRef, AssetWithMeta } from '../types/asset'

/**
 * Order-Status, die als "bestellt" zählen. `draft` ist ein Arbeitsentwurf und
 * zählt NICHT — der Händler soll keine Bilder zu noch nicht eingereichten
 * Entwürfen bekommen. Diese Liste ist die EINE Stelle, an der sich die
 * Status-Semantik ändern lässt (Kundenentscheidung offen gelassen).
 */
export const ORDERED_STATUSES = ['submitted', 'confirmed'] as const

/** Minimaler Verweis auf eine Order-Position (nur product_id zählt). */
export interface OrderItemRef {
  product_id: string | null
}

/**
 * Distinct-Artikel-IDs aus den Order-Positionen. Null/Leer wird verworfen.
 * Deterministisch sortiert, damit die Ableitung reproduzierbar ist.
 */
export function orderedProductIds(items: OrderItemRef[]): string[] {
  const ids = new Set<string>()
  for (const it of items) {
    if (it.product_id) ids.add(it.product_id)
  }
  return [...ids].sort()
}

/**
 * Bilder eines Händlers aus den bestellten Artikeln ableiten:
 *  - nur Assets, deren product_id zu einem bestellten Artikel gehört,
 *  - nur Fotos (keine Videos — es geht um Bildmaterial),
 *  - Duplikate (gleiche Asset-id) raus,
 *  - deterministisch sortiert (Dateiname, dann id als Tiebreaker).
 *
 * Leere Bestellung / keine passenden Bilder → leere Liste, KEIN Fehler.
 */
export function dealerImageAssets(
  assets: AssetWithMeta[],
  productIds: string[],
): AssetWithMeta[] {
  const wanted = new Set(productIds)
  const seen = new Set<string>()
  const out: AssetWithMeta[] = []

  for (const a of assets) {
    if (a.asset_kind !== 'photo') continue
    if (!a.product_id || !wanted.has(a.product_id)) continue
    if (seen.has(a.id)) continue
    seen.add(a.id)
    out.push(a)
  }

  out.sort((x, y) => {
    const byName = x.filename.localeCompare(y.filename)
    return byName !== 0 ? byName : x.id.localeCompare(y.id)
  })
  return out
}

/** Ein Artikel mit seinen Bildern (für die gruppierte Vorschau). */
export interface DealerImageGroup {
  product: AssetProductRef | null
  assets: AssetWithMeta[]
}

/**
 * Bilder nach Artikel gruppieren (für die Vorschau im Händler-Detail).
 * Reihenfolge der Gruppen deterministisch nach Artikelname; die Bilder je
 * Gruppe behalten die (bereits sortierte) Eingangsreihenfolge.
 */
export function groupImagesByArticle(
  assets: AssetWithMeta[],
): DealerImageGroup[] {
  const groups = new Map<string, DealerImageGroup>()
  for (const a of assets) {
    const key = a.product_id ?? '∅'
    let g = groups.get(key)
    if (!g) {
      g = { product: a.product ?? null, assets: [] }
      groups.set(key, g)
    }
    g.assets.push(a)
  }
  return [...groups.values()].sort((x, y) =>
    (x.product?.name ?? '').localeCompare(y.product?.name ?? ''),
  )
}
