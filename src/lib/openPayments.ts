import { supabase } from './supabase'
import type { InvoiceListRow } from '../types/invoice'

/**
 * Offene Posten: alle versendeten Rechnungen der eigenen Org (RLS scoped).
 * „sent" = noch nicht bezahlt und nicht storniert. Fälligkeit aufsteigend,
 * damit die am längsten überfälligen oben stehen (null-due zuletzt).
 */
export async function listOpenPayments(): Promise<InvoiceListRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, dealer:dealers(name, zahlungsziel_tage)')
    .eq('status', 'sent')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as unknown as InvoiceListRow[]
}
