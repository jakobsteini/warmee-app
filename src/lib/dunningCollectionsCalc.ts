// Reine Inkasso-Logik — bewusst OHNE Supabase-Import, damit sie unter
// `node --test` (ohne Vite-Env) prüfbar ist (Muster wie itemKey.ts /
// commissionCalc.ts). Die datenbeschaffenden Funktionen liegen in
// dunningCollections.ts und delegieren die Entscheidungen hierher.
import type { DunningLevel } from '../types/dunning'

/**
 * Die letzte konfigurierte Mahnstufe = die mit der höchsten level_number.
 * null, wenn keine Stufen konfiguriert sind.
 */
export function lastConfiguredLevel(levels: DunningLevel[]): DunningLevel | null {
  let last: DunningLevel | null = null
  for (const l of levels) {
    if (!last || l.level_number > last.level_number) last = l
  }
  return last
}

/**
 * Darf für eine Rechnung an Inkasso übergeben werden? Nur, wenn
 *   1. die erreichte Stufe die LETZTE konfigurierte Stufe ist, und
 *   2. noch KEIN aktiver Inkasso-Fall existiert.
 * (Der Button ist erst ab der letzten Stufe sichtbar.)
 */
export function canHandOver(
  reached: DunningLevel | null,
  levels: DunningLevel[],
  hasActiveCollection: boolean,
): boolean {
  if (hasActiveCollection) return false
  const last = lastConfiguredLevel(levels)
  if (!reached || !last) return false
  return reached.level_number === last.level_number
}
