import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import {
  remainingReturnable,
  canReturnQuantity,
  returnTotal,
  type ExistingReturn,
  type ReturnableItem,
} from './returnsCalc'
import type { InvoiceItem } from '../types/invoice'
import type {
  Return,
  ReturnWithItems,
  ReturnableLine,
  InvoiceReturnContext,
  CreateReturnInput,
} from '../types/return'

// ============================================================================
// Datenschicht für Retouren (Variante B, positionsbasiert, ohne Bestandskonto).
// Verankert an der Rechnung. Reine Mengen-/Summen-Rechnung liegt supabase-frei in
// returnsCalc.ts — hier wird nur geladen, delegiert und geschrieben. Snapshot:
// unit_price/line_total/total_amount werden beim Erfassen eingefroren. Kein
// Löschen — Storno setzt status='cancelled' + Grund/Benutzer (siehe cancelReturn).
// KEINE Andockung an offene Posten oder deductions in diesem Modul.
// ============================================================================

/** Alle Retouren-Vorgänge einer Rechnung inkl. Positionen, neueste zuerst. */
export async function listReturnsByInvoice(
  invoiceId: string,
): Promise<ReturnWithItems[]> {
  const { data, error } = await supabase
    .from('returns')
    .select('*, return_items(*)')
    .eq('invoice_id', invoiceId)
    .order('return_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ReturnWithItems[]
}

/** Rechnungspositionen einer Rechnung (Herkunft der Retouren-Zeilen). */
async function loadInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const { data, error } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
  if (error) throw error
  return (data ?? []) as unknown as InvoiceItem[]
}

/** ReturnWithItems → das für die Mengenrechnung nötige ExistingReturn. */
function toExistingReturns(returns: ReturnWithItems[]): ExistingReturn[] {
  return returns.map((r) => ({
    status: r.status,
    items: r.return_items.map((i) => ({
      invoice_item_id: i.invoice_item_id,
      quantity: i.quantity,
    })),
  }))
}

/**
 * Kontext für die Retouren-Erfassung: je Rechnungsposition die noch
 * retournierbare Menge (recorded-Retouren berücksichtigt, Storno ignoriert)
 * plus die Liste der bestehenden Vorgänge.
 */
export async function loadInvoiceReturnContext(
  invoiceId: string,
): Promise<InvoiceReturnContext> {
  const [items, returns] = await Promise.all([
    loadInvoiceItems(invoiceId),
    listReturnsByInvoice(invoiceId),
  ])

  const returnable: ReturnableItem[] = items.map((i) => ({
    id: i.id,
    quantity: i.quantity,
  }))
  const existing = toExistingReturns(returns)
  const remaining = remainingReturnable(returnable, existing)

  const lines: ReturnableLine[] = items.map((i) => {
    const rem = remaining.get(i.id) ?? 0
    return {
      invoice_item_id: i.id,
      description: i.description,
      product_id: i.product_id,
      color: i.color,
      size: i.size,
      invoiced_quantity: i.quantity,
      returned_quantity: i.quantity - rem,
      remaining_quantity: rem,
      unit_price: i.unit_price,
    }
  })

  return { lines, returns }
}

/**
 * Retoure erfassen: Kopf + Positionen anlegen. Snapshot von unit_price/
 * line_total aus den Rechnungspositionen; total_amount = Summe der Zeilen.
 * Validiert jede Zeile hart gegen die noch retournierbare Menge (canReturnQuantity)
 * — die UI blockt zusätzlich, aber die Datenschicht ist die letzte Instanz.
 */
export async function createReturn(input: CreateReturnInput): Promise<Return> {
  if (input.lines.length === 0) {
    throw new Error('Eine Retoure braucht mindestens eine Position.')
  }

  const [org_id, created_by, items, returns] = await Promise.all([
    getMyOrgId(),
    getMyUserId(),
    loadInvoiceItems(input.invoice_id),
    listReturnsByInvoice(input.invoice_id),
  ])

  const itemById = new Map(items.map((i) => [i.id, i]))
  const remaining = remainingReturnable(
    items.map((i) => ({ id: i.id, quantity: i.quantity })),
    toExistingReturns(returns),
  )

  // Rechnung für dealer_id (Verankerung) — die Retoure hängt am Händler der
  // Rechnung, nicht an einer aus dem UI mitgereichten Angabe.
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('dealer_id')
    .eq('id', input.invoice_id)
    .single()
  if (invErr) throw invErr

  const itemRows = input.lines.map((line) => {
    const src = itemById.get(line.invoice_item_id)
    if (!src) {
      throw new Error('Position gehört nicht zu dieser Rechnung.')
    }
    const rem = remaining.get(line.invoice_item_id) ?? 0
    if (!canReturnQuantity(rem, line.quantity)) {
      throw new Error(
        `Retouren-Menge (${line.quantity}) übersteigt die noch retournierbare Menge (${rem}).`,
      )
    }
    const unit_price = Number(src.unit_price)
    return {
      invoice_item_id: src.id,
      product_id: src.product_id,
      color: src.color,
      size: src.size,
      quantity: line.quantity,
      unit_price,
      line_total: Math.round(line.quantity * unit_price * 100) / 100,
    }
  })

  const total_amount = returnTotal(
    itemRows.map((r) => ({ quantity: r.quantity, unit_price: r.unit_price })),
  )

  const { data: created, error: insErr } = await supabase
    .from('returns')
    .insert({
      org_id,
      invoice_id: input.invoice_id,
      dealer_id: (invoice as { dealer_id: string }).dealer_id,
      return_date: input.return_date,
      reason: input.reason ?? null,
      total_amount,
      status: 'recorded',
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  const returnRow = created as unknown as Return
  const { error: itemErr } = await supabase
    .from('return_items')
    .insert(itemRows.map((r) => ({ ...r, return_id: returnRow.id })))
  if (itemErr) throw itemErr

  return returnRow
}

/**
 * Retoure stornieren: status='cancelled' + Grund/Benutzer/Zeit. Nichts wird
 * gelöscht; der Vorgang bleibt als Historie stehen und zählt danach nicht mehr
 * zur retournierten Menge oder zu Gutschrift-Summen.
 */
export async function cancelReturn(id: string, reason: string): Promise<void> {
  const cancelled_by = await getMyUserId()
  const { error } = await supabase
    .from('returns')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by,
      cancellation_reason: reason,
    })
    .eq('id', id)
    .eq('status', 'recorded')
  if (error) throw error
}
