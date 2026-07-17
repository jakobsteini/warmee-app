/** ISO-Datum (YYYY-MM-DD) um n Tage verschieben, als YYYY-MM-DD zurück. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Ganze Tage von ISO-Datum a bis b (b − a). Für das Zurückrechnen des
 * Zahlungsziels aus einem eingefrorenen due_date. */
export function daysBetweenIso(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}
