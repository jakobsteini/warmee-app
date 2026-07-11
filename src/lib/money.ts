/** Betrag (number oder numeric-String aus PostgREST) als EUR formatieren. */
export function formatEUR(value: number | string | null): string {
  if (value === null || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

/** Preistext (deutsches Komma erlaubt) zu number oder null. */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}
