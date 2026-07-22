import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import { recordedReturnsByInvoice } from './returns'
import { openAfterReturns } from './returnsCalc'
import type { BelegItem } from './pdf'
import {
  pdfLang,
  invoicePdfLabels,
  deliveryNotePdfLabels,
} from './pdfLabels'
import { addDaysIso, daysBetweenIso } from './dates'
import {
  computeSkonto,
  effectivePaymentTerms,
  type PaymentTerms,
  type PartialPaymentTerms,
} from './tax'
import {
  resolveInvoicePaymentTerms,
  type InvoiceOrderTerms,
} from './paymentTerms'
import { shippingDisplay } from './shipping'
import { taxCalc, applyVat as applyVatAt } from './taxCalc'
import { listOssRates, ossRateMap } from './ossRates'
import type { CustomerGroup } from '../types/dealer'
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

/**
 * Alle Rechnungen der eigenen Org (RLS scoped), neueste zuerst, samt offenem Rest
 * (total − recorded Retouren). Retouren-Quelle und Rechenweg zentral
 * (recordedReturnsByInvoice + openAfterReturns) — keine zweite Rechenstelle.
 */
export async function listInvoices(): Promise<InvoiceListRow[]> {
  const [invRes, returnsByInvoice] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, dealer:dealers(name)')
      .order('created_at', { ascending: false }),
    recordedReturnsByInvoice(),
  ])

  if (invRes.error) throw invRes.error
  return ((invRes.data ?? []) as unknown as InvoiceListRow[]).map((r) => ({
    ...r,
    open_amount: openAfterReturns(r.total, returnsByInvoice.get(r.id) ?? 0),
  }))
}

/** Eine Rechnung inkl. Händlerdaten und Positionen laden. */
export async function getInvoice(id: string): Promise<InvoiceWithItems> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      // language wird nur für die Belegsprache beim Regenerieren gebraucht (nicht
      // Teil der PDF-Dealerish) — die Beträge/tax_note bleiben eingefroren.
      '*, dealer:dealers(name, contact_name, email, city, country, language), invoice_items(*)',
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

/** Steuerrelevante Händlerfelder für die Kategorie-Ableitung (taxCalc). */
export interface TaxDealer {
  customer_group: CustomerGroup
  country_iso2: string | null
  uid: string | null
  language: string | null
}

interface DeliveryContext {
  dealer_id: string
  dealer: Dealerish
  /** Steuerfelder des Händlers für die Kategorie-Ableitung. */
  taxDealer: TaxDealer
  /** Zahlungskonditionen des Händlers (roh, nullable) – Fallback ohne Order-Link. */
  terms: PartialPaymentTerms
  /**
   * Zahlungskonditionen der verlinkten Order (delivery.order_id) — Session 2.
   * null, wenn keine Order verlinkt ist (Altlieferung) → dann gelten die
   * Händlerkonditionen. Order gewinnt bei gesetztem Link.
   */
  orderTerms: InvoiceOrderTerms | null
  /**
   * Versandart der verlinkten Order (delivery.order_id) — Session 3. null ohne
   * Order-Link (Altlieferung) → keine Versandart-Zeile auf dem Lieferschein.
   */
  orderShipping: { method: string | null; freitext: string | null } | null
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
      'dealer_id, order_id, dealer:dealers(name, contact_name, email, city, country, customer_group, country_iso2, uid, language, skonto_prozent, skonto_tage, zahlungsziel_tage), order:orders(zahlungsziel_tage, skonto_prozent, skonto_tage, zahlungsbedingung_freitext, shipping_method, shipping_method_freitext), production_order:production_orders(season:seasons(label))',
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
    order_id: string | null
    dealer: (Dealerish & PartialPaymentTerms & Partial<TaxDealer>) | null
    order: {
      zahlungsziel_tage: number | null
      skonto_prozent: number | string | null
      skonto_tage: number | null
      zahlungsbedingung_freitext: string | null
      shipping_method: string | null
      shipping_method_freitext: string | null
    } | null
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
    // Nur die Belegfelder in die (PDF-)Dealerish; die Konditionsfelder werden
    // separat als terms geführt, damit die PDF-Signatur schlank bleibt.
    dealer: {
      name: d.dealer?.name ?? 'Unbekannt',
      contact_name: d.dealer?.contact_name ?? null,
      email: d.dealer?.email ?? null,
      city: d.dealer?.city ?? null,
      country: d.dealer?.country ?? null,
    },
    taxDealer: {
      customer_group: (d.dealer?.customer_group ?? 'b2b') as CustomerGroup,
      country_iso2: d.dealer?.country_iso2 ?? null,
      uid: d.dealer?.uid ?? null,
      language: d.dealer?.language ?? null,
    },
    terms: {
      skonto_prozent: d.dealer?.skonto_prozent ?? null,
      skonto_tage: d.dealer?.skonto_tage ?? null,
      zahlungsziel_tage: d.dealer?.zahlungsziel_tage ?? null,
    },
    // Order-Konditionen nur, wenn die Lieferung mit einer Order verlinkt ist.
    orderTerms:
      d.order_id && d.order
        ? {
            zahlungsziel_tage: d.order.zahlungsziel_tage ?? 30,
            skonto_prozent: num2(d.order.skonto_prozent),
            skonto_tage: d.order.skonto_tage ?? null,
            freitext: d.order.zahlungsbedingung_freitext ?? null,
          }
        : null,
    orderShipping:
      d.order_id && d.order
        ? {
            method: d.order.shipping_method ?? null,
            freitext: d.order.shipping_method_freitext ?? null,
          }
        : null,
    seasonLabel: d.production_order?.season?.label ?? null,
    items,
  }
}

/** numeric/number/null der Order-Skontosatz robust zu number|null (kein 0-Zwang). */
function num2(v: number | string | null): number | null {
  if (v === null || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? null : n
}

/** Eingefrorene Steuerwerte einer neuen Rechnung. */
interface FrozenTax {
  tax_rate: number
  tax_amount: number
  total: number
  /** Pflichthinweis in der Belegsprache des Kunden (de-Fallback), oder null. */
  tax_note: string | null
  tax_category: string
}

/**
 * Steuer für eine NEUE Rechnung ableiten (taxCalc aus Kundentyp + Land + UID
 * gegen die OSS-Sätze) und die Werte zum Einfrieren zurückgeben. BLOCKT hart —
 * und zwar bewusst so, dass jeder Aufrufer diese Funktion VOR der Vergabe der
 * Rechnungsnummer (next_invoice_number) aufruft, damit ein Block keine Nummer
 * verbraucht:
 *   • country_iso2 fehlt        → eigene Meldung „Land setzen".
 *   • ossMissing (B2C-EU ohne OSS-Satz) oder review (B2C-Drittland/unklar)
 *                               → Meldung, keine steuerlich falsche Rechnung.
 * B2B-Drittland (gültige 0-%-Ausfuhr) blockt NICHT — es ist review=false.
 */
async function deriveInvoiceTax(
  dealer: TaxDealer,
  subtotal: number,
): Promise<FrozenTax> {
  if (!dealer.country_iso2) {
    throw new Error(
      'Bitte Land des Kunden setzen (Steuer-Sektion), bevor eine Rechnung erzeugt wird.',
    )
  }
  const rates = await listOssRates()
  const tax = taxCalc(
    {
      customer_group: dealer.customer_group,
      country_iso2: dealer.country_iso2,
      uid: dealer.uid,
    },
    ossRateMap(rates),
  )
  if (tax.ossMissing || tax.review) {
    throw new Error(
      'Steuerkategorie unklar oder OSS-Satz fehlt — bitte Kundenstammdaten (Steuer-Sektion) oder OSS-Tabelle prüfen.',
    )
  }
  const { vat: tax_amount, gross: total } = applyVatAt(subtotal, tax.rate)
  const tax_note = tax.note
    ? dealer.language === 'en'
      ? tax.note.en
      : tax.note.de
    : null
  return { tax_rate: tax.rate, tax_amount, total, tax_note, tax_category: tax.category }
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

  // Versandart aus der verlinkten Order — beim Erzeugen EINFRIEREN (Snapshot) und
  // in Kundensprache anzeigen. Ohne Order-Link (Altlieferung) → keine Versandart.
  const lang = pdfLang(ctx.taxDealer.language)
  const shippingText = ctx.orderShipping
    ? shippingDisplay(ctx.orderShipping.method, ctx.orderShipping.freitext, lang)
    : null

  const { data: number, error: numErr } = await supabase.rpc(
    'next_delivery_note_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr

  // Kopf zuerst committen (Nummer ist damit vergeben). Versandart als eingefrorenen
  // Snapshot mitschreiben (roh: Methode + Freitext).
  const { data: note, error: insErr } = await supabase
    .from('delivery_notes')
    .insert({
      org_id,
      delivery_id: deliveryId,
      dealer_id: ctx.dealer_id,
      note_number: number as string,
      shipping_method: ctx.orderShipping?.method ?? null,
      shipping_method_freitext: ctx.orderShipping?.freitext ?? null,
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
    labels: deliveryNotePdfLabels(lang),
    number: note.note_number,
    date: note.note_date,
    dealer: ctx.dealer,
    seasonLabel: ctx.seasonLabel,
    shipping: shippingText,
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
  // Steuer aus der Kategorie ableiten + einfrieren. Blockt VOR der Nummernvergabe
  // (country fehlt / ossMissing / review) → keine verbrauchte Rechnungsnummer.
  const { tax_rate, tax_amount, total, tax_note, tax_category } =
    await deriveInvoiceTax(ctx.taxDealer, subtotal)

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
      tax_note,
      tax_category,
      status: 'draft',
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  // Zahlungskonditionen einfrieren: bei verlinkter Order gewinnt die Order
  // (Session 2), sonst die Händlerkonditionen (WARM-ME-Standard aufgefüllt). Die
  // daraus berechnete Fälligkeit wird als konkretes due_date EINGEFROREN (unten im
  // update) — spätere Änderungen an Order/Händler verschieben gestellte Rechnungen
  // NICHT rückwirkend.
  const terms = resolveInvoicePaymentTerms(
    ctx.orderTerms,
    effectivePaymentTerms(ctx.terms),
  )
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
    labels: invoicePdfLabels(pdfLang(ctx.taxDealer.language)),
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
    taxRate: tax_rate,
    total,
    taxNote: tax_note,
    zahlungszielTage: terms.zahlungsziel_tage,
    skonto: skontoForPdf(invoice.invoice_date, total, terms),
    paymentTermsFreitext: terms.freitext,
    notes: null,
  })
  const path = await uploadPdf(
    org_id,
    `rechnung-${safeName(invoice.invoice_number)}.pdf`,
    blob,
  )
  const { data: updated, error: upErr } = await supabase
    .from('invoices')
    .update({
      pdf_path: path,
      due_date: dueDate,
      // Skonto + Freitext zum Rechnungszeitpunkt einfrieren (Snapshot wie due_date).
      skonto_prozent: terms.skonto_prozent,
      skonto_tage: terms.skonto_tage,
      zahlungsbedingung_freitext: terms.freitext,
    })
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
      'name, contact_name, email, city, country, customer_group, country_iso2, uid, language, skonto_prozent, skonto_tage, zahlungsziel_tage',
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
  // Steuer aus der Kategorie ableiten + einfrieren (wie order-basierte Rechnung).
  // Blockt VOR der Nummernvergabe → keine verbrauchte Rechnungsnummer.
  const { tax_rate, tax_amount, total, tax_note, tax_category } =
    await deriveInvoiceTax(
      {
        customer_group: (dealer.customer_group ?? 'b2b') as CustomerGroup,
        country_iso2: dealer.country_iso2 ?? null,
        uid: dealer.uid ?? null,
        language: dealer.language ?? null,
      },
      subtotal,
    )

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
      tax_note,
      tax_category,
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
    labels: invoicePdfLabels(pdfLang(dealer.language)),
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
    taxRate: tax_rate,
    total,
    taxNote: tax_note,
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
    .update({
      pdf_path: path,
      due_date: dueDate,
      // Skonto zum Rechnungszeitpunkt einfrieren (Snapshot wie due_date).
      skonto_prozent: terms.skonto_prozent,
      skonto_tage: terms.skonto_tage,
    })
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

  // Konditionen aus den EINGEFRORENEN Rechnungswerten, damit das neu erzeugte
  // PDF dem Original entspricht. Zahlungsziel aus dem eingefrorenen due_date
  // zurückgerechnet. Altbestände ohne Snapshot (skonto_*/due_date null) fallen
  // pro Feld auf den WARM-ME-Standard zurück — genau so wurden sie gedruckt.
  const terms = effectivePaymentTerms({
    skonto_prozent: inv.skonto_prozent,
    skonto_tage: inv.skonto_tage,
    zahlungsziel_tage: inv.due_date
      ? daysBetweenIso(inv.invoice_date, inv.due_date)
      : null,
  })
  const total = num(inv.total)

  // Belegsprache aus dem Kunden (de-Fallback). language ist nicht Teil der
  // PDF-Dealerish, kommt aber aus dem getInvoice-Select mit → hier lokal gelesen.
  // Beträge und tax_note bleiben eingefroren; nur die Label-Sprache folgt dem Kunden.
  const dealerLang = (inv.dealer as (Dealerish & { language?: string | null }) | null)
    ?.language
  const { buildInvoicePdf } = await import('./pdf')
  const blob = buildInvoicePdf({
    labels: invoicePdfLabels(pdfLang(dealerLang)),
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
    taxRate: num(inv.tax_rate),
    total,
    taxNote: inv.tax_note ?? null,
    zahlungszielTage: terms.zahlungsziel_tage,
    skonto: skontoForPdf(inv.invoice_date, total, terms),
    // Eingefrorener Freitext bleibt (Snapshot); Altbelege haben null → keine Zeile.
    paymentTermsFreitext: inv.zahlungsbedingung_freitext ?? null,
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
