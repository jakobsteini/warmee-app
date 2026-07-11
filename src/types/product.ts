/** Ein Produkt-/Artikel-Datensatz (snake_case wie in der DB). */
export interface Product {
  id: string
  org_id: string
  name: string
  category: string | null
  /** Mehrfarbig möglich (Postgres text[]). */
  color: string[] | null
  /** Endkundenpreis; numeric(10,2) – kann als number oder string ankommen. */
  retail_price: number | string | null
  /** Großhandelspreis; numeric(10,2). */
  wholesale_price: number | string | null
  season_id: string | null
  created_at: string | null
}

/** Felder zum Anlegen/Bearbeiten eines Produkts (org_id kommt aus dem Profil). */
export interface ProductInput {
  name: string
  category: string | null
  color: string[] | null
  retail_price: number | null
  wholesale_price: number | null
  season_id: string | null
}

/**
 * Bekannte Kategorien (englisch gespeichert, wie im Airtable-Katalog).
 * `category` ist in der DB frei (kein Check) – unbekannte Werte bleiben
 * erhalten und werden unverändert angezeigt.
 */
export const PRODUCT_CATEGORIES = ['hat', 'sweater', 'scarf', 'cardigan'] as const

/** Deutsche UI-Labels für die bekannten Kategorien. */
export const CATEGORY_LABELS: Record<string, string> = {
  hat: 'Mütze',
  sweater: 'Pullover',
  scarf: 'Schal',
  cardigan: 'Cardigan',
}

/** Label einer Kategorie fürs UI (Fallback: der Rohwert). */
export function categoryLabel(category: string | null): string {
  if (!category) return '—'
  return CATEGORY_LABELS[category] ?? category
}
