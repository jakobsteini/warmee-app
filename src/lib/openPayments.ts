import { supabase } from './supabase'
import type { InvoiceListRow } from '../types/invoice'
import { openAfterReturns } from './returnsCalc'
import { recordedReturnsByInvoice } from './returns'

/** Eine offene Rechnung mit ihrem Retouren-geminderten offenen Rest (brutto). */
export interface OpenPaymentRow extends InvoiceListRow {
  /**
   * Offener Rest BRUTTO = total − Σ recorded Retouren. Immer > 0 — voll
   * gutgeschriebene Rechnungen (Rest ≤ 0) sind aus der Liste ausgeblendet
   * (abgeleitet; invoices.status bleibt unverändert 'sent').
   */
  open_amount: number
}

/**
 * Offene Posten: alle versendeten Rechnungen der eigenen Org (RLS scoped),
 * gemindert um die (recorded) Retouren-Gutschriften. „sent" = noch nicht bezahlt
 * und nicht storniert. Der offene Rest kommt zentral aus
 * returnsCalc.openAfterReturns (keine zweite Rechenstelle); Rechnungen mit Rest
 * ≤ 0 (voll retourniert) fallen abgeleitet heraus. Fälligkeit aufsteigend, damit
 * die am längsten überfälligen oben stehen (null-due zuletzt).
 */
export async function listOpenPayments(): Promise<OpenPaymentRow[]> {
  const [invoicesRes, returnsByInvoice] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, dealer:dealers(name, zahlungsziel_tage)')
      .eq('status', 'sent')
      .order('due_date', { ascending: true, nullsFirst: false }),
    recordedReturnsByInvoice(),
  ])

  if (invoicesRes.error) throw invoicesRes.error
  return ((invoicesRes.data ?? []) as unknown as InvoiceListRow[])
    .map((r) => ({
      ...r,
      open_amount: openAfterReturns(r.total, returnsByInvoice.get(r.id) ?? 0),
    }))
    .filter((r) => r.open_amount > 0)
}
