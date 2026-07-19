import { supabase } from './supabase'
import type { InvoiceListRow } from '../types/invoice'
import { openAfterReturns } from './returnsCalc'
import { refundDue } from './refundCalc'
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

/**
 * Eine offene Rückerstattung: eine bereits bezahlte Rechnung, die nach der
 * Zahlung retourniert wurde, sodass dem Händler ein Betrag zurückzuerstatten ist.
 * BEWUSST getrennt von OpenPaymentRow — das ist die umgekehrte Vorzeichen-Seite
 * (wir schulden dem Händler), sie darf nie in „offen" hineinsummiert werden.
 */
export interface OpenRefundRow {
  id: string
  invoice_number: string
  dealer_id: string
  dealer_name: string | null
  /** Zurückzuerstattender Betrag (brutto), > 0. */
  refund_amount: number
}

/**
 * Offene Rückerstattungen: bezahlte Rechnungen (status='paid') mit späteren
 * Retouren, bei denen mehr gezahlt wurde als die um die Retoure geminderte
 * Forderung. Betrag zentral über refundCalc.refundDue (keine zweite Rechenstelle,
 * Skonto-korrekt). openAfterReturns/„offener Rest" bleibt davon unberührt — dies
 * ist die andere geklemmte Hälfte derselben signierten Position. Größte Erstattung
 * zuerst.
 */
export async function listOpenRefunds(): Promise<OpenRefundRow[]> {
  const [invoicesRes, returnsByInvoice] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, dealer_id, total, paid_amount, dealer:dealers(name)')
      .eq('status', 'paid'),
    recordedReturnsByInvoice(),
  ])

  if (invoicesRes.error) throw invoicesRes.error
  return ((invoicesRes.data ?? []) as unknown as {
    id: string
    invoice_number: string
    dealer_id: string
    total: number | string
    paid_amount: number | string | null
    dealer: { name: string } | null
  }[])
    .map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      dealer_id: r.dealer_id,
      dealer_name: r.dealer?.name ?? null,
      refund_amount: refundDue(r.total, returnsByInvoice.get(r.id) ?? 0, r.paid_amount),
    }))
    .filter((r) => r.refund_amount > 0)
    .sort((a, b) => b.refund_amount - a.refund_amount)
}
