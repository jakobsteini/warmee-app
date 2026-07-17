import type { Product } from '../types/product'

/** Vergleichsnormalisierung: getrimmt + klein. */
function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/** Strenge Normalisierung für den exakten Abgleich: nur Buchstaben a–z, lower. */
function normLetters(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Vergleichs-/Anzeigebasis eines Artikels: bevorzugt `style`
 * (Artikelbezeichnung des Produzenten), sonst der Name.
 */
export function productLabel(p: Product): string {
  const style = p.style?.trim()
  return style && style.length > 0 ? style : p.name
}

/** Art des Treffers – für die UI-Kennzeichnung. */
export type SuggestionKind = 'exact' | 'contains'

export interface ProductSuggestion {
  product: Product
  kind: SuggestionKind
}

/**
 * Vorschlagsliste für ein Bild anhand seines geparsten `model`-Werts.
 *
 * Rangfolge:
 *   1. exakte Treffer  – norm(style) === norm(model)
 *   2. Teilstring      – style enthält model ODER model enthält style
 * Innerhalb einer Gruppe: kürzerer Style zuerst (liegt näher am Modell),
 * dann alphabetisch. Ohne `model` (reine Farbbilder) gibt es keine
 * Modell-Vorschläge – dann hilft im UI nur die durchsuchbare Gesamtauswahl.
 */
export function suggestProducts(
  model: string | null,
  products: Product[],
): ProductSuggestion[] {
  const m = norm(model)
  if (m === '') return []

  const out: ProductSuggestion[] = []
  for (const p of products) {
    const s = norm(productLabel(p))
    if (s === '') continue
    if (s === m) out.push({ product: p, kind: 'exact' })
    else if (s.includes(m) || m.includes(s)) out.push({ product: p, kind: 'contains' })
  }

  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'exact' ? -1 : 1
    const la = productLabel(a.product).length
    const lb = productLabel(b.product).length
    if (la !== lb) return la - lb
    return productLabel(a.product).localeCompare(productLabel(b.product))
  })
}

/**
 * Durchsuchbare Gesamtauswahl: alle Artikel, deren Label die Suchanfrage
 * enthält (case-insensitive), alphabetisch. Leere Anfrage → alle.
 */
export function filterProducts(query: string, products: Product[]): Product[] {
  const q = norm(query)
  const list =
    q === ''
      ? products
      : products.filter((p) => norm(productLabel(p)).includes(q))
  return [...list].sort((a, b) =>
    productLabel(a).localeCompare(productLabel(b)),
  )
}

/**
 * Eindeutiger exakter Treffer für ein geparstes Modell: genau EIN Artikel,
 * dessen Name (nur-Buchstaben, lower) dem Modell (ebenso normalisiert) gleicht.
 *
 * Bewusst gegen `products.name` (nicht `productLabel`/`style`) und ohne jede
 * Präfix-/Fuzzy-Logik: "AxisFeltedShaded" trifft "Axis felted" NICHT — das ist
 * eine eigene Variante, kein Grundartikel. 0 Treffer (kein_treffer) ODER >1
 * (mehrdeutig) → null; nur ein eindeutiger Treffer wird zurückgegeben.
 */
export function exactProductMatch(
  model: string | null,
  products: Product[],
): Product | null {
  const m = normLetters(model)
  if (m === '') return null
  const hits = products.filter((p) => normLetters(p.name) === m)
  return hits.length === 1 ? hits[0] : null
}
