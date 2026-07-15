import { supabase } from './supabase'
import { isOverdue, type DueInput } from './dueDates'

export interface DashboardStats {
  dealers: number
  assets: number
  openOrders: number
  overdueInvoices: number
}

/** Zeilen einer Tabelle zählen (RLS scoped die Org automatisch). */
async function countRows(
  table: string,
  build: (q: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount> = (
    q,
  ) => q,
): Promise<number> {
  const { count, error } = await build(baseCount(table))
  if (error) throw error
  return count ?? 0
}

function baseCount(table: string) {
  return supabase.from(table).select('*', { count: 'exact', head: true })
}

/** Anzahl überfälliger, versendeter Rechnungen über die gemeinsame Fälligkeits-
 * logik (dueDates). Kann NICHT als reine DB-Zählung laufen: Rechnungen ohne
 * gespeichertes due_date brauchen den Fallback invoice_date + Zahlungsziel,
 * damit dieselbe Definition wie in Offene Posten und Bonität gilt. */
async function countOverdueInvoices(): Promise<number> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_date, due_date, dealer:dealers(zahlungsziel_tage)')
    .eq('status', 'sent')
  if (error) throw error
  return ((data ?? []) as unknown as DueInput[]).filter((r) => isOverdue(r))
    .length
}

/**
 * Kennzahlen fürs Dashboard: Händler, Bilder im Archiv, offene Orders
 * (Status != confirmed) und überfällige Rechnungen (Status = sent,
 * Fälligkeit vor heute — gemeinsame dueDates-Logik).
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [dealers, assets, openOrders, overdueInvoices] = await Promise.all([
    countRows('dealers'),
    countRows('assets'),
    countRows('orders', (q) => q.neq('status', 'confirmed')),
    countOverdueInvoices(),
  ])

  return { dealers, assets, openOrders, overdueInvoices }
}
