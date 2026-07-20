// Reine Order-Summen — bewusst OHNE Supabase-Import, damit sie unter
// `node --test` (ohne Vite-Env) prüfbar sind (Muster wie commissionCalc.ts /
// returnsCalc.ts). Reine Anzeige-/Vorschau-Werte: hier wird NICHTS eingefroren
// (der Steuer-Snapshot lebt an der Rechnung, nicht an der Order).
//
// Die Betragslogik je Zeile liegt zentral in types/order.ts (lineTotal) und
// wird hier WIEDERVERWENDET, nicht dupliziert.
import { lineTotal } from '../types/order.ts'

/** Das für die Summen Nötige einer Order-Position. */
export interface OrderCalcItem {
  quantity: number
  unit_price: number | string | null
}

/** Gesamt-Stückzahl = Summe der Mengen über alle Positionen. */
export function totalQuantity(items: readonly OrderCalcItem[]): number {
  return items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
}

/**
 * Gesamtsumme (Betrag, netto) = Summe aus Menge × Einzelpreis über alle
 * Positionen. Nutzt lineTotal (types/order.ts) je Zeile — dieselbe Definition
 * wie die Zeilenanzeige, keine zweite Rechenlogik.
 */
export function totalAmount(items: readonly OrderCalcItem[]): number {
  return items.reduce((sum, i) => sum + lineTotal(i.quantity, i.unit_price), 0)
}
