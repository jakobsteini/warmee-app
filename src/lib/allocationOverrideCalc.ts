/**
 * Rechenkern für das manuelle Übersteuern der Kunden-Zuteilung (Modul D-Ergänzung).
 * Supabase-frei → unter `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 *
 * Aufgabe: Restmenge, harte Grenzprüfung und Summenkontrolle je Position. Die
 * Summe der zugeteilten Mengen darf die verfügbare (bestellte) Menge einer
 * Position NIE überschreiten — Block-statt-raten. Untermengen (bewusst weniger
 * verteilen) sind erlaubt und werden über die Restmenge sichtbar gemacht.
 */

/** Eine Zuteilungszeile (nur die Menge zählt für die Summenkontrolle). */
export interface AllocationLine {
  quantity: number
}

/** Summe der zugeteilten Mengen. */
export function allocationSum(lines: readonly AllocationLine[]): number {
  return lines.reduce((s, l) => s + (l.quantity || 0), 0)
}

/**
 * Noch zu verteilen: capacity − Σ zugeteilt. Positiv = Rest offen (Untermenge),
 * 0 = genau aufgeteilt, negativ = Überschreitung (nicht erlaubt).
 */
export function allocationRemaining(
  capacity: number,
  lines: readonly AllocationLine[],
): number {
  return capacity - allocationSum(lines)
}

/** Überschreitungsmenge (0, wenn im Rahmen). */
export function allocationOverBy(
  capacity: number,
  lines: readonly AllocationLine[],
): number {
  return Math.max(0, allocationSum(lines) - capacity)
}

/**
 * Harte Grenze: die Summe darf capacity NICHT überschreiten. Untermengen sind
 * erlaubt (Summe < capacity ist gültig). Negative Einzelmengen sind ungültig.
 */
export function isWithinCapacity(
  capacity: number,
  lines: readonly AllocationLine[],
): boolean {
  if (lines.some((l) => !Number.isFinite(l.quantity) || l.quantity < 0)) return false
  return allocationSum(lines) <= capacity
}
