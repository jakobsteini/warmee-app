import type { TranslationKey } from '../i18n/dict'

/** Ein Produkt-/Artikel-Datensatz (snake_case wie in der DB). */
export interface Product {
  id: string
  org_id: string
  name: string
  category: string | null
  /** Mehrfarbig möglich (Postgres text[]). */
  color: string[] | null
  /** Endkundenpreis (RTL); numeric(10,2) – kann als number oder string ankommen. */
  retail_price: number | string | null
  /** Großhandelspreis (WHS); numeric(10,2). */
  wholesale_price: number | string | null
  /** Einkaufspreis (EK) vom Produzenten; numeric(10,2). Excel: "price shangrila". */
  purchase_price: number | string | null
  season_id: string | null
  /** Lieferant/Produzent des Artikels (FK auf producers). null = nicht zugeordnet. */
  producer_id: string | null
  /** Artikel-Gruppe für Auswertungen (FK auf article_groups). null = keine Gruppe. */
  group_id: string | null
  /** Größen-Schema (Stamm-Etikett): 'uni' | 'xs_2xl' (erweiterbar). Steuert NICHT die Bestellgrößen. */
  size_scheme: string | null
  /** Freier Kollektionsname, getrennt von season_id. */
  collection: string | null
  /** €-Aufschlag je Artikel (Stammwert), EUR. Nur erfasst — in keiner Rechnung. */
  zuschlag: number | string | null
  created_at: string | null

  // ─── Artikelstamm SS27 (Import), alle nullable ───────────────────────────
  /** Artikelbezeichnung des Produzenten (Excel: Style). */
  style: string | null
  /** Materialzusammensetzung, z. B. "100% cashmere". */
  composition: string | null
  /** Feinheit/Gauge, z. B. "14gg". */
  gauge: string | null
  /** Fachung, z. B. "1 ply". */
  ply: string | null
  /** Garnstärke, z. B. "42/2". */
  yarn_count: string | null
  /** Gewicht, z. B. "122gms". */
  weight: string | null
  /** Freitext-Notiz (Excel: NOTE). */
  note: string | null
}

/** Felder zum Anlegen/Bearbeiten eines Produkts (org_id kommt aus dem Profil). */
export interface ProductInput {
  name: string
  category: string | null
  color: string[] | null
  retail_price: number | null
  wholesale_price: number | null
  /** EK-Preis Nepal (Artikel-Stamm), EUR, ohne Fracht/Zoll. Excel: "price shangrila". */
  purchase_price: number | null
  season_id: string | null
  producer_id: string | null
  /** Artikel-Gruppe für Auswertungen (FK auf article_groups). null = keine Gruppe. */
  group_id: string | null
  /** Materialzusammensetzung (Excel: Composition), Freitext. UI-Label "Qualität". */
  composition: string | null
  /** Größen-Schema (Stamm-Etikett): 'uni' | 'xs_2xl' (erweiterbar). */
  size_scheme: string | null
  /** Freier Kollektionsname, getrennt von season_id. */
  collection: string | null
  /** €-Aufschlag je Artikel (Stammwert), EUR. Nur erfasst — in keiner Rechnung. */
  zuschlag: number | null
}

/** Größen-Schema-Werte (app-seitig validiert, kein DB-CHECK; erweiterbar). */
export const SIZE_SCHEMES = ['uni', 'xs_2xl'] as const

/** Deutsche/englische UI-Labels der Größen-Schemata (via i18n-Key aufgelöst). */
export const SIZE_SCHEME_LABEL_KEYS: Record<string, TranslationKey> = {
  uni: 'products.sizeScheme.uni',
  xs_2xl: 'products.sizeScheme.xs2xl',
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
