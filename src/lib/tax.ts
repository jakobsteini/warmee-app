/**
 * Umsatzsteuer (Österreich).
 *
 * WARM ME ist regelbesteuert — KEIN Kleinunternehmer. Der Regelsteuersatz
 * beträgt 20 %. Zentral hier definiert, damit Rechnungsberechnung, PDF und
 * UI denselben Satz verwenden. Die Zahl darf nirgends sonst hardcodiert sein.
 */

/** Umsatzsteuer-Regelsatz als Faktor (0.20 = 20 %). */
export const VAT_RATE = 0.2

/** Steuersatz in Prozent für die Anzeige, z. B. „USt (20 %)". */
export const VAT_RATE_PERCENT = Math.round(VAT_RATE * 100)

/** Kaufmännisch auf ganze Cent runden. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Nettobetrag → { net, tax, gross } mit dem Regelsteuersatz, jeweils auf
 * ganze Cent gerundet. Basis für die Steuerausweisung auf der Rechnung.
 */
export function applyVat(net: number): {
  net: number
  tax: number
  gross: number
} {
  const n = roundCents(net)
  const tax = roundCents(n * VAT_RATE)
  return { net: n, tax, gross: roundCents(n + tax) }
}
