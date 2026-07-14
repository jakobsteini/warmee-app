import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import type { BelegItem } from './pdf'
import { addDaysIso } from './dates'
import {
  VAT_RATE,
  applyVat,
  computeSkonto,
  effectivePaymentTerms,
  type PaymentTerms,
} from './tax'
import type {
  DeliveryNote,
  Dealerish,
  FreeInvoiceInput,
  Invoice,
  InvoiceListRow,
  InvoiceStatus,
  InvoiceWithItems,
} from '../types/invoice'

const BUCKET = 'invoices'
/** Gültigkeit der Signed-URLs für den PDF-Download (privater Bucket). */
const SIGNED_URL_TTL = 60 * 60 // 1 Stunde

/**
 * Skonto-Block für die PDF aus Rechnungsdatum, Bruttobetrag und Konditionen
 * bauen — oder null, wenn kein Skonto gilt (prozent 0).
 */
function skontoForPdf(invoiceDate: string, gross: number, terms: PaymentTerms) {
  if (terms.skonto_prozent <= 0) return null
  return {
    date: addDaysIso(invoiceDate, terms.skonto_tage),
    ...computeSkonto(gross, terms.skonto_prozent),
  }
}

/** numeric/number robust zu number. */
function num(v: number | string | null): number {
  if (v === null || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

// ─── Laden ────────────────────────────────────────────────────────────────

/** Alle Rechnungen der eigenen Org (RLS scoped), neueste zuerst. */
export async function listInvoices(): Promise<InvoiceListRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, dealer:dealers(name)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as InvoiceListRow[]
}

/** Eine Rechnung inkl. Händlerdaten und Positionen laden. */
export async function getInvoice(id: string): Promise<InvoiceWithItems> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      '*, dealer:dealers(name, contact_name, email, city, country), invoice_items(*)',
    )
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as InvoiceWithItems
}

/** Rechnungen und Lieferscheine, die zu einer Lieferung gehören. */
export async function listDeliveryDocuments(deliveryId: string): Promise<{
  invoices: Invoice[]
  deliveryNotes: DeliveryNote[]
}> {
  const [inv, dn] = await Promise.all([
    supabase
      .from('invoices')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: false }),
    supabase
      .from('delivery_notes')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: false }),
  ])
  if (inv.error) throw inv.error
  if (dn.error) throw dn.error
  return {
    invoices: (inv.data ?? []) as Invoice[],
    deliveryNotes: (dn.data ?? []) as DeliveryNote[],
  }
}

/** Signierte Download-URL für ein Beleg-PDF (privater Bucket). */
export async function signedPdfUrl(pdfPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_TTL)
  if (error || !data) throw error ?? new Error('URL konnte nicht erzeugt werden.')
  return data.signedUrl
}

// ─── Gemeinsame Datenbeschaffung ────────────────────────────────────────────

interface DeliveryContext {
  dealer_id: string
  dealer: Dealerish
  seasonLabel: string | null
  items: {
    product_id: string
    description: string
    color: string | null
    size: string | null
    quantity: number
    wholesale_price: number
  }[]
}

/** Händler, Saison und Positionen (mit Großhandelspreis) einer Lieferung laden. */
async function loadDeliveryContext(
  deliveryId: string,
): Promise<DeliveryContext> {
  const { data: del, error: delErr } = await supabase
    .from('deliveries')
    .select(
      'dealer_id, dealer:dealers(name, contact_name, email, city, country), production_order:production_orders(season:seasons(label))',
    )
    .eq('id', deliveryId)
    .single()
  if (delErr) throw delErr

  const { data: rows, error: itemErr } = await supabase
    .from('delivery_items')
    .select('product_id, color, size, quantity, product:products(name, wholesale_price)')
    .eq('delivery_id', deliveryId)
    .order('created_at', { ascending: true })
  if (itemErr) throw itemErr

  const d = del as unknown as {
    dealer_id: string
    dealer: Dealerish | null
    production_order: { season: { label: string } | null } | null
  }

  const items = (rows ?? []).map((r) => {
    const row = r as unknown as {
      product_id: string
      color: string | null
      size: string | null
      quantity: number
      product: { name: string; wholesale_price: number | string | null } | null
    }
    return {
      product_id: row.product_id,
      description: row.product?.name ?? 'Artikel',
      color: row.color,
      size: row.size,
      quantity: row.quantity ?? 0,
      wholesale_price: num(row.product?.wholesale_price ?? 0),
    }
  })

  return {
    dealer_id: d.dealer_id,
    dealer: d.dealer ?? {
      name: 'Unbekannt',
      contact_name: null,
      email: null,
      city: null,
      country: null,
    },
    seasonLabel: d.production_order?.season?.label ?? null,
    items,
  }
}

/** PDF in den privaten Bucket legen (überschreibt bei Neuerzeugung). */
async function uploadPdf(orgId: string, filename: string, blob: Blob): Promise<string> {
  const path = `${orgId}/${filename}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw error
  return path
}

/** Belegnummer für Dateinamen entschärfen. */
function safeName(number: string): string {
  return number.replace(/[^a-zA-Z0-9-]/g, '_')
}

// ─── Lieferschein ───────────────────────────────────────────────────────────

/**
 * Lieferschein aus einer Lieferung erzeugen: fortlaufende Nummer (LS-YYYY-0001),
 * Kopf-Datensatz anlegen, PDF (ohne Preise) bauen und im Storage ablegen.
 */
export async function createDeliveryNote(
  deliveryId: string,
): Promise<DeliveryNote> {
  const org_id = await getMyOrgId()
  const created_by = await getMyUserId()
  const ctx = await loadDeliveryContext(deliveryId)

  const { data: number, error: numErr } = await supabase.rpc(
    'next_delivery_note_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr

  // Kopf zuerst committen (Nummer ist damit vergeben).
  const { data: note, error: insErr } = await supabase
    .from('delivery_notes')
    .insert({
      org_id,
      delivery_id: deliveryId,
      dealer_id: ctx.dealer_id,
      note_number: number as string,
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  const belegItems: BelegItem[] = ctx.items.map((i) => ({
    description: i.description,
    color: i.color,
    size: i.size,
    quantity: i.quantity,
  }))

  const { buildDeliveryNotePdf } = await import('./pdf')
  const blob = buildDeliveryNotePdf({
    number: note.note_number,
    date: note.note_date,
    dealer: ctx.dealer,
    seasonLabel: ctx.seasonLabel,
    items: belegItems,
    notes: null,
  })

  const path = await uploadPdf(org_id, `lieferschein-${safeName(note.note_number)}.pdf`, blob)
  const { data: updated, error: upErr } = await supabase
    .from('delivery_notes')
    .update({ pdf_path: path })
    .eq('id', note.id)
    .select()
    .single()
  if (upErr) throw upErr
  return updated as DeliveryNote
}

// ─── Rechnung ────────────────────────────────────────────────────────────────

/**
 * Rechnung aus einer Lieferung erzeugen: fortlaufende Nummer (YYYY-0001),
 * Positionen aus den Lieferpositionen (Großhandelspreis), Regelbesteuerung
 * mit 20 % USt. Die Nummer wird mit dem Datensatz sofort committet — auch wenn
 * die PDF-Erzeugung fehlschlägt, entsteht keine Lücke.
 *
 * Wirft, wenn bereits eine aktive (nicht stornierte) Rechnung zur Lieferung
 * existiert. Nach einer Stornierung wird die neue Rechnung als Ersatz mit der
 * stornierten verknüpft (cancelled_by).
 */
export async function createInvoice(deliveryId: string): Promise<Invoice> {
  const org_id = await getMyOrgId()
  const created_by = await getMyUserId()

  // Nur eine aktive Rechnung je Lieferung.
  const { data: existing, error: exErr } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('delivery_id', deliveryId)
    .neq('status', 'cancelled')
  if (exErr) throw exErr
  if ((existing ?? []).length > 0) {
    throw new Error(
      'Für diese Lieferung existiert bereits eine aktive Rechnung. Bitte zuerst stornieren.',
    )
  }

  const ctx = await loadDeliveryContext(deliveryId)
  if (ctx.items.length === 0) {
    throw new Error('Die Lieferung enthält keine Positionen.')
  }

  const subtotal = ctx.items.reduce(
    (s, i) => s + i.quantity * i.wholesale_price,
    0,
  )
  // Regelbesteuerung: 20 % USt auf den Nettobetrag.
  const tax_rate = VAT_RATE
  const { tax: tax_amount, gross: total } = applyVat(subtotal)

  const { data: number, error: numErr } = await supabase.rpc(
    'next_invoice_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr

  const { data: invoice, error: insErr } = await supabase
    .from('invoices')
    .insert({
      org_id,
      delivery_id: deliveryId,
      dealer_id: ctx.dealer_id,
      invoice_number: number as string,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      status: 'draft',
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  // Zahlungskonditionen: bis der Händler-Import die Felder befüllt (Migration
  // noch nicht live), gilt der WARM-ME-Standard (30 Tage netto, 3 %/10 Skonto).
  // Später kommen hier die Händlerwerte hinein: effectivePaymentTerms(dealer).
  const terms = effectivePaymentTerms(null)
  const dueDate = addDaysIso(invoice.invoice_date, terms.zahlungsziel_tage)

  const itemRows = ctx.items.map((i) => ({
    invoice_id: invoice.id,
    product_id: i.product_id,
    description: i.description,
    color: i.color,
    size: i.size,
    quantity: i.quantity,
    unit_price: i.wholesale_price,
    line_total: i.quantity * i.wholesale_price,
  }))
  const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows)
  if (itemErr) throw itemErr

  // Stornierte Vorgänger-Rechnungen dieser Lieferung als „ersetzt" verknüpfen.
  await supabase
    .from('invoices')
    .update({ cancelled_by: invoice.id })
    .eq('delivery_id', deliveryId)
    .eq('status', 'cancelled')
    .is('cancelled_by', null)

  // PDF bauen, hochladen, Pfad speichern.
  const { buildInvoicePdf } = await import('./pdf')
  const blob = buildInvoicePdf({
    number: invoice.invoice_number,
    date: invoice.invoice_date,
    dueDate,
    dealer: ctx.dealer,
    items: ctx.items.map((i) => ({
      description: i.description,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
      unitPrice: i.wholesale_price,
      lineTotal: i.quantity * i.wholesale_price,
    })),
    subtotal,
    tax: tax_amount,
    total,
    zahlungszielTage: terms.zahlungsziel_tage,
    skonto: skontoForPdf(invoice.invoice_date, total, terms),
    notes: null,
  })
  const path = await uploadPdf(
    org_id,
    `rechnung-${safeName(invoice.invoice_number)}.pdf`,
    blob,
  )
  const { data: updated, error: upErr } = await supabase
    .from('invoices')
    .update({ pdf_path: path, due_date: dueDate })
    .eq('id', invoice.id)
    .select()
    .single()
  if (upErr) throw upErr
  return updated as Invoice
}

/**
 * Freie Rechnung erstellen: ohne zugrundeliegende Lieferung (delivery_id = null),
 * mit manuell erfassten Positionen. Verwendet DENSELBEN Nummernkreis wie
 * order-basierte Rechnungen (RPC next_invoice_number) und dieselbe
 * 20-%-USt-/Skonto-Automatik. Zahlungskonditionen kommen aus dem gewählten
 * Händler (effectivePaymentTerms), sonst WARM-ME-Standard. Die Nummer wird mit
 * dem Datensatz sofort committet — auch bei späterem PDF-Fehler keine Lücke.
 */
export async function createFreeInvoice(
  input: FreeInvoiceInput,
): Promise<Invoice> {
  const org_id = await getMyOrgId()
  const created_by = await getMyUserId()

  const items = input.items
    .map((i) => ({
      description: i.description.trim(),
      quantity: i.quantity,
      unit_price: i.unit_price,
    }))
    .filter((i) => i.description !== '' && i.quantity > 0)
  if (items.length === 0) {
    throw new Error('Bitte mindestens eine Position mit Menge erfassen.')
  }

  // Händlerdaten (für Beleg und Konditionen) laden – RLS scoped auf die Org.
  const { data: dealer, error: dealerErr } = await supabase
    .from('dealers')
    .select(
      'name, contact_name, email, city, country, skonto_prozent, skonto_tage, zahlungsziel_tage',
    )
    .eq('id', input.dealer_id)
    .single()
  if (dealerErr) throw dealerErr

  const dealerish: Dealerish = {
    name: dealer.name,
    contact_name: dealer.contact_name,
    email: dealer.email,
    city: dealer.city,
    country: dealer.country,
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  // Regelbesteuerung: 20 % USt auf den Nettobetrag (wie order-basierte Rechnung).
  const tax_rate = VAT_RATE
  const { tax: tax_amount, gross: total } = applyVat(subtotal)

  const { data: number, error: numErr } = await supabase.rpc(
    'next_invoice_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr

  const { data: invoice, error: insErr } = await supabase
    .from('invoices')
    .insert({
      org_id,
      delivery_id: null, // freie Rechnung ohne Lieferung
      dealer_id: input.dealer_id,
      invoice_number: number as string,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      status: 'draft',
      notes: input.notes,
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  const itemRows = items.map((i) => ({
    invoice_id: invoice.id,
    product_id: null,
    description: i.description,
    color: null,
    size: null,
    quantity: i.quantity,
    unit_price: i.unit_price,
    line_total: i.quantity * i.unit_price,
  }))
  const { error: itemErr } = await supabase
    .from('invoice_items')
    .insert(itemRows)
  if (itemErr) throw itemErr

  // Konditionen aus dem Händler, sonst WARM-ME-Standard.
  const terms = effectivePaymentTerms(dealer)
  const dueDate = addDaysIso(invoice.invoice_date, terms.zahlungsziel_tage)

  const { buildInvoicePdf } = await import('./pdf')
  const blob = buildInvoicePdf({
    number: invoice.invoice_number,
    date: invoice.invoice_date,
    dueDate,
    dealer: dealerish,
    items: items.map((i) => ({
      description: i.description,
      color: null,
      size: null,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      lineTotal: i.quantity * i.unit_price,
    })),
    subtotal,
    tax: tax_amount,
    total,
    zahlungszielTage: terms.zahlungsziel_tage,
    skonto: skontoForPdf(invoice.invoice_date, total, terms),
    notes: input.notes,
  })
  const path = await uploadPdf(
    org_id,
    `rechnung-${safeName(invoice.invoice_number)}.pdf`,
    blob,
  )
  const { data: updated, error: upErr } = await supabase
    .from('invoices')
    .update({ pdf_path: path, due_date: dueDate })
    .eq('id', invoice.id)
    .select()
    .single()
  if (upErr) throw upErr
  return updated as Invoice
}

/** PDF einer bestehenden Rechnung neu erzeugen (z. B. nach fehlgeschlagenem Upload). */
export async function regenerateInvoicePdf(id: string): Promise<Invoice> {
  const org_id = await getMyOrgId()
  const inv = await getInvoice(id)

  // Konditionen: WARM-ME-Standard (Händlerwerte kommen mit dem Import).
  const terms = effectivePaymentTerms(null)
  const total = num(inv.total)

  const { buildInvoicePdf } = await import('./pdf')
  const blob = buildInvoicePdf({
    number: inv.invoice_number,
    date: inv.invoice_date,
    dueDate: inv.due_date,
    dealer: inv.dealer ?? {
      name: 'Unbekannt',
      contact_name: null,
      email: null,
      city: null,
      country: null,
    },
    items: inv.invoice_items.map((i) => ({
      description: i.description,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
      unitPrice: num(i.unit_price),
      lineTotal: num(i.line_total),
    })),
    subtotal: num(inv.subtotal),
    tax: num(inv.tax_amount),
    total,
    zahlungszielTage: terms.zahlungsziel_tage,
    skonto: skontoForPdf(inv.invoice_date, total, terms),
    notes: inv.notes,
  })
  const path = await uploadPdf(
    org_id,
    `rechnung-${safeName(inv.invoice_number)}.pdf`,
    blob,
  )
  const { data, error } = await supabase
    .from('invoices')
    .update({ pdf_path: path })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Invoice
}

/**
 * Rechnung als versendet markieren (Entwurf → Versendet). Für „bezahlt" gibt es
 * einen eigenen Weg mit Datum und Betrag ({@link markInvoicePaid}), damit ein
 * Zahlungseingang nie ohne diese Daten entsteht.
 */
export async function setInvoiceStatus(
  id: string,
  status: Extract<InvoiceStatus, 'sent'>,
): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Invoice
}

/**
 * Zahlungseingang erfassen: Rechnung mit Zahlungsdatum und -betrag als bezahlt
 * markieren. paid_at ist die maßgebliche Quelle des Bezahlt-Zustands; status
 * wird synchron auf 'paid' gesetzt (Badges/Listen hängen daran). Keine
 * Teilzahlungen — ein Datum + ein Betrag je Rechnung.
 */
export async function markInvoicePaid(
  id: string,
  paidAt: string,
  paidAmount: number,
): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: paidAt, paid_amount: paidAmount })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Invoice
}

/**
 * Rechnung stornieren. Eine gesendete Rechnung kann nicht geändert, nur
 * storniert werden; danach kann für die Lieferung eine neue Rechnung erstellt
 * werden.
 */
export async function cancelInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Invoice
}
