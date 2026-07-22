/**
 * Reiner Kern fürs Beleg-Archiv (supabase-frei, unter `node --test` prüfbar).
 * Bildet den Archiv-Dateinamen nach dem Schema Belegnummer_Kundenname_Datum.pdf
 * und entschärft dabei alle für Dateipfade unsicheren Zeichen.
 */

/** Ein Namensbestandteil auf [A-Za-z0-9-] reduzieren; leer → 'x'. */
export function safeSegment(s: string | null | undefined): string {
  const cleaned = (s ?? '')
    .replace(/[^a-zA-Z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'x'
}

/**
 * Archiv-Dateiname `Belegnummer_Kundenname_Datum.pdf`. Alle Teile werden
 * entschärft, damit der Name als Storage-Pfad-Segment sicher ist.
 */
export function archiveFileName(
  belegnummer: string,
  dealerName: string | null,
  belegDatum: string | null,
): string {
  return `${safeSegment(belegnummer)}_${safeSegment(dealerName)}_${safeSegment(belegDatum)}.pdf`
}
