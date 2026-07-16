// Reine Retouren-Logik — bewusst OHNE Supabase-Import, damit sie unter
// `node --test` (ohne Vite-Env) prüfbar ist (Muster wie itemKey.ts /
// commissionCalc.ts / dunningCollectionsCalc.ts). Die datenbeschaffenden
// Funktionen liegen in returns.ts und delegieren die Rechnung hierher.
//
// Variante B: Teilretouren je Rechnungsposition. Ein Storno (status='cancelled')
// zählt nirgends mit — weder bei der noch retournierbaren Menge noch bei den
// Gutschrift-Summen.

export type ReturnStatus = 'recorded' | 'cancelled'

/** numeric/number/null robust zu number (wie in creditRating.ts). */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

/** Kaufmännisch auf 2 Nachkommastellen runden. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Eine Rechnungsposition, reduziert auf das für die Mengenrechnung Nötige. */
export interface ReturnableItem {
  /** invoice_item.id */
  id: string
  /** berechnete Menge auf der Rechnung */
  quantity: number
}

/** Eine Retouren-Zeile (Bezug auf die Rechnungsposition + Menge). */
export interface ReturnLineInput {
  invoice_item_id: string
  quantity: number
}

/** Ein bestehender Retouren-Vorgang mit Status und seinen Zeilen. */
export interface ExistingReturn {
  status: ReturnStatus
  items: ReturnLineInput[]
}

/**
 * Je Rechnungsposition (invoice_item_id) bereits retournierte Menge — nur aus
 * Vorgängen mit status='recorded'. Stornierte Retouren zählen NICHT.
 */
export function returnedQuantities(
  existing: ExistingReturn[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const ret of existing) {
    if (ret.status !== 'recorded') continue
    for (const line of ret.items) {
      map.set(line.invoice_item_id, (map.get(line.invoice_item_id) ?? 0) + line.quantity)
    }
  }
  return map
}

/**
 * Je Rechnungsposition noch retournierbare Menge = berechnete Menge − bereits
 * (recorded) retourniert, nie unter 0. Positionen ohne Retoure erscheinen mit
 * ihrer vollen Menge.
 */
export function remainingReturnable(
  items: ReturnableItem[],
  existing: ExistingReturn[],
): Map<string, number> {
  const returned = returnedQuantities(existing)
  const map = new Map<string, number>()
  for (const it of items) {
    const rest = it.quantity - (returned.get(it.id) ?? 0)
    map.set(it.id, rest > 0 ? rest : 0)
  }
  return map
}

/**
 * Harte Mengenprüfung für EINE zu erfassende Retouren-Zeile: die angeforderte
 * Menge muss eine positive ganze Zahl sein und darf die noch retournierbare
 * Menge nicht übersteigen. (Muster wie updateDeliveryItemQuantity: hart blocken.)
 */
export function canReturnQuantity(remaining: number, requested: number): boolean {
  if (!Number.isInteger(requested)) return false
  if (requested < 1) return false
  return requested <= remaining
}

/** Gutschrift-Summe einer Menge Zeilen (Menge × Einzelpreis), auf 2 gerundet. */
export function returnTotal(
  lines: { quantity: number; unit_price: number | string }[],
): number {
  const sum = lines.reduce((s, l) => s + l.quantity * num(l.unit_price), 0)
  return round2(sum)
}

/**
 * Offener Rest einer Rechnung nach Retouren = Rechnungsbetrag − Summe der
 * (recorded) Gutschriften, nie unter 0. Zentrale Definition für die spätere
 * Andockung an die offenen Posten.
 */
export function openAfterReturns(
  invoiceTotal: number | string,
  returnsTotal: number,
): number {
  const rest = num(invoiceTotal) - returnsTotal
  return rest > 0 ? round2(rest) : 0
}
