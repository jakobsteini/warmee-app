import { addDaysIso } from './dates.ts'
import { DEFAULT_ZAHLUNGSZIEL_TAGE } from './tax.ts'

// ============================================================================
// Fälligkeit & Überfälligkeit — die EINE gemeinsame Definition für alle
// Ansichten (Offene Posten, Bonitäts-Ampel, Dashboard, Mahnwesen). Bewusst
// zentral, damit keine zweite, abweichende Logik daneben entsteht.
//
// Regel:
//   • Fälligkeit = gespeichertes due_date (spiegelt die Konditionen zum
//     Rechnungszeitpunkt, eingefroren — verschiebt sich NICHT rückwirkend).
//   • Fehlt due_date (z. B. PDF-Erzeugung schlug fehl / Altbestand), dann
//     invoice_date + Händler-Zahlungsziel; ist auch das nicht bekannt, der
//     WARM-ME-Standard (DEFAULT_ZAHLUNGSZIEL_TAGE).
//   • Überfällig = Fälligkeit liegt vor heute.
// ============================================================================

/** Heute als ISO-Kurzdatum (YYYY-MM-DD), für den Fälligkeitsvergleich. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Minimal-Form einer Rechnung für die Fälligkeitsrechnung. Sowohl die
 * Offene-Posten-Zeile (InvoiceListRow) als auch die Bonitäts-Rohzeile erfüllen
 * diese Form strukturell — beide joinen den Händler mit zahlungsziel_tage.
 */
export interface DueInput {
  invoice_date: string | null
  due_date: string | null
  dealer?: { zahlungsziel_tage?: number | null } | null
}

/** Fälligkeitsdatum (ISO) oder null, wenn nicht bestimmbar (kein Rechnungsdatum). */
export function faelligkeitIso(inv: DueInput): string | null {
  if (inv.due_date) return inv.due_date
  if (inv.invoice_date) {
    const ziel = inv.dealer?.zahlungsziel_tage ?? DEFAULT_ZAHLUNGSZIEL_TAGE
    return addDaysIso(inv.invoice_date, ziel)
  }
  return null
}

/** Überfällig, wenn die Fälligkeit vor `today` liegt (Default: heute). */
export function isOverdue(inv: DueInput, today: string = todayIso()): boolean {
  const faellig = faelligkeitIso(inv)
  return faellig !== null && faellig < today
}

/** Tage überfällig (today − Fälligkeit) oder null, wenn (noch) nicht überfällig. */
export function daysOverdue(
  inv: DueInput,
  today: string = todayIso(),
): number | null {
  const faellig = faelligkeitIso(inv)
  if (!faellig) return null
  const d = Math.round(
    (new Date(today).getTime() - new Date(faellig).getTime()) / 86_400_000,
  )
  return d > 0 ? d : null
}
