/**
 * Reiner Kern für die Rechnungskorrektur (supabase-frei, `node --test`-fähig).
 * Eine Retoure hält ihre Gutschrift-Summen POSITIV (net/tax/gross). Die
 * Rechnungskorrektur weist dieselben Beträge als MINUS aus — der Betrag, um den
 * die ursprüngliche Rechnung gemindert wird.
 */

/** numeric/number/string robust zu number. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

export interface CorrectionTotals {
  net: number
  tax: number
  gross: number
}

/**
 * Korrektur-Summen aus den (positiven) Retouren-Summen: als Minus ausgewiesen.
 * `Math.abs` stellt sicher, dass das Vorzeichen unabhängig vom Eingabe-Vorzeichen
 * eindeutig negativ ist (0 bleibt 0).
 */
export function correctionTotals(
  net: number | string,
  tax: number | string,
  gross: number | string,
): CorrectionTotals {
  // `|| 0` normalisiert -0 auf 0 (Betrag negativ, aber 0 bleibt sauber 0).
  return {
    net: -Math.abs(num(net)) || 0,
    tax: -Math.abs(num(tax)) || 0,
    gross: -Math.abs(num(gross)) || 0,
  }
}
