import { supabase } from './supabase'

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

/**
 * Kennzahlen fürs Dashboard: Händler, Bilder im Archiv, offene Orders
 * (Status != confirmed) und überfällige Rechnungen (Status = sent,
 * Fälligkeitsdatum vor heute).
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().slice(0, 10)

  const [dealers, assets, openOrders, overdueInvoices] = await Promise.all([
    countRows('dealers'),
    countRows('assets'),
    countRows('orders', (q) => q.neq('status', 'confirmed')),
    countRows('invoices', (q) => q.eq('status', 'sent').lt('due_date', today)),
  ])

  return { dealers, assets, openOrders, overdueInvoices }
}
