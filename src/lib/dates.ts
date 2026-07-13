/** ISO-Datum (YYYY-MM-DD) um n Tage verschieben, als YYYY-MM-DD zurück. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
