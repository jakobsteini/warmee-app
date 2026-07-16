import { supabase } from './supabase'
import { isOverdue, type DueInput } from './dueDates'
import { recordedReturnsByInvoice } from './returns'
import { openAfterReturns } from './returnsCalc'

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
 * damit dieselbe Definition wie in Offene Posten und Bonität gilt. Voll
 * retournierte Rechnungen (offener Rest ≤ 0) zählen nicht mehr mit — konsistent
 * dazu, dass Offene Posten sie ausblendet (recordedReturnsByInvoice +
 * openAfterReturns, keine zweite Rechenstelle). */
async function countOverdueInvoices(): Promise<number> {
  const [invRes, returnsByInvoice] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, total, invoice_date, due_date, dealer:dealers(zahlungsziel_tage)')
      .eq('status', 'sent'),
    recordedReturnsByInvoice(),
  ])
  if (invRes.error) throw invRes.error
  return (
    (invRes.data ?? []) as unknown as (DueInput & { id: string; total: number | string })[]
  ).filter(
    (r) => isOverdue(r) && openAfterReturns(r.total, returnsByInvoice.get(r.id) ?? 0) > 0,
  ).length
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
