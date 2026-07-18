// Reiner Kern der Kunden-Lagerliste — bewusst OHNE Supabase/jsPDF-Import, damit
// er unter `node --test` prüfbar ist (Muster wie inventoryCalc.ts / returnsCalc.ts).
// Die datenbeschaffende Schicht (stockList.ts) lädt Bestand/Artikel/Bilder und
// delegiert die Aggregation hierher; das PDF baut pdf.ts.
//
// Aggregation je (Artikel, Farbe): der Bestand wird über Größe UND Variante
// summiert (wie die bestehende Stock List — dort gibt es keine Größen-/Varianten-
// Spalte). Varianten werden NICHT getrennt ausgewiesen.

/** numeric/number/null robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Eine Bestandszeile, reduziert auf das für die Lagerliste Nötige. */
export interface StockAggInput {
  product_id: string
  color: string | null
  /** Ist-Bestand dieser Dimension (vorzeichenbehaftet). */
  bestand: number
}

/** Artikel-Stammdaten für die Anreicherung (Name + Großhandelspreis). */
export interface ProductMeta {
  name: string
  wholesale_price: number | string | null
}

/** Eine aggregierte Zeile der Lagerliste: je (Artikel, Farbe). */
export interface StockAggRow {
  product_id: string
  article: string
  color: string | null
  /** Summe über Größe + Variante. */
  pieces: number
  wholesalePrice: number | null
}

/**
 * Normalisierter Farb-Schlüssel: getrimmt + kleingeschrieben. Wird für das
 * Swatch-Matching gebraucht ("Camel"/"camel"/"camel " → derselbe Swatch) —
 * verändert KEINE gespeicherten Daten, dient nur dem Nachschlagen.
 */
export function normalizeColorKey(color: string | null): string {
  return (color ?? '').trim().toLowerCase()
}

/** Gruppierungs-Schlüssel je (Artikel, EXAKTE Farbe). Die Farbe wird für die
 *  Aggregation NICHT normalisiert — "Camel" und "camel" bleiben getrennte Zeilen
 *  (Freitext-Identität wie im übrigen System; strukturierte Farben sind ein
 *  eigener späterer Baustein). */
function groupKey(product_id: string, color: string | null): string {
  return `${product_id}||${color ?? ''}`
}

/**
 * Aggregiert Bestandszeilen je (Artikel, Farbe), summiert Stück über Größe +
 * Variante, reichert Name + Großhandelspreis aus den Artikel-Stammdaten an.
 * Zeilen mit Stück ≤ 0 fallen raus (leere/negative sind für eine Kunden-
 * Verfügbarkeitsliste nicht auszuweisen). Sortiert nach Artikel, dann Farbe.
 */
export function aggregateStock(
  rows: StockAggInput[],
  meta: Map<string, ProductMeta>,
): StockAggRow[] {
  const map = new Map<string, StockAggRow>()
  for (const r of rows) {
    const key = groupKey(r.product_id, r.color)
    const existing = map.get(key)
    if (existing) {
      existing.pieces += r.bestand
    } else {
      const m = meta.get(r.product_id)
      map.set(key, {
        product_id: r.product_id,
        article: m?.name ?? '—',
        color: r.color,
        pieces: r.bestand,
        wholesalePrice: m ? num(m.wholesale_price) : null,
      })
    }
  }
  return [...map.values()]
    .filter((r) => r.pieces > 0)
    .sort(
      (a, b) =>
        a.article.localeCompare(b.article, 'de') ||
        (a.color ?? '').localeCompare(b.color ?? '', 'de'),
    )
}

/** Gesamtbestand = Summe der ausgewiesenen Stück. */
export function totalPieces(rows: StockAggRow[]): number {
  return rows.reduce((s, r) => s + r.pieces, 0)
}
