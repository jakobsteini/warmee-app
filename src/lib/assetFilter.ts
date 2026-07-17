import type { AssetWithMeta } from '../types/asset'
import { categoryLabel } from '../types/product.ts'

/**
 * Gemeinsamer, supabase-freier Filter-Kern für Bildarchiv und Zuschnitt.
 * Beide Seiten nutzen dieselben Funktionen — keine zweite Implementierung.
 */

export interface AssetFilterState {
  /** Freitext; leer = keine Textsuche. */
  search: string
  /** Produktgruppe (products.category-Rohwert); null/'' = alle Gruppen. */
  group: string | null
}

/**
 * Produktgruppe eines Bildes = Kategorie des verknüpften Artikels.
 * null, wenn kein Artikel verknüpft ist oder der Artikel keine Kategorie hat.
 */
export function assetGroup(a: AssetWithMeta): string | null {
  return a.product?.category ?? null
}

/**
 * Alle in den Bildern tatsächlich vorkommenden Gruppen (Kategorie-Rohwerte),
 * sortiert nach ihrem deutschen Label. „Dynamisch aus Daten" — es wird nichts
 * erfunden, der Filter bietet nur Gruppen an, die es wirklich gibt.
 */
export function availableGroups(assets: AssetWithMeta[]): string[] {
  const set = new Set<string>()
  for (const a of assets) {
    const g = assetGroup(a)
    if (g) set.add(g)
  }
  return [...set].sort((x, y) =>
    categoryLabel(x).localeCompare(categoryLabel(y), 'de'),
  )
}

/**
 * Bilder nach Gruppe (UND) und Freitext filtern. Die Suche greift in Dateiname,
 * Modell, beide Farbcodes/-namen sowie Name/Style des verknüpften Artikels.
 */
export function filterAssets(
  assets: AssetWithMeta[],
  { search, group }: AssetFilterState,
): AssetWithMeta[] {
  const q = search.trim().toLowerCase()
  return assets.filter((a) => {
    if (group && assetGroup(a) !== group) return false
    if (q === '') return true
    const haystack = [
      a.filename,
      a.model,
      a.color_code,
      a.color_name,
      a.color_code_2,
      a.color_name_2,
      a.product?.name ?? null,
      a.product?.style ?? null,
    ]
    return haystack.some((v) => v != null && v.toLowerCase().includes(q))
  })
}
