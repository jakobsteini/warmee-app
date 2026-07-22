import { supabase } from './supabase'
import { getMyOrgId, getMyUserId } from './org'
import {
  recordedReturnsByInvoice,
  returnedQuantitiesByDeliveryNote,
} from './returns'
import { openAfterReturns } from './returnsCalc'
import type { BelegItem } from './pdf'
import {
  pdfLang,
  invoicePdfLabels,
  correctionPdfLabels,
  deliveryNotePdfLabels,
} from './pdfLabels'
import { correctionTotals } from './correctionCalc'
import { returnTotal } from './returnsCalc'
import type { Return, CreateFreeCorrectionInput } from '../types/return'
import { addDaysIso, daysBetweenIso } from './dates'
import {
  computeSkonto,
  effectivePaymentTerms,
  type PaymentTerms,
  type PartialPaymentTerms,
} from './tax'
import {
  resolveInvoicePaymentTerms,
  applyInvoiceTermOverrides,
  type InvoiceOrderTerms,
  type InvoiceTermOverrides,
  type FrozenInvoiceTerms,
} from './paymentTerms'
import { shippingDisplay } from './shipping'
import { taxCalc, applyVat as applyVatAt } from './taxCalc'
import { listOssRates, ossRateMap } from './ossRates'
import type { CustomerGroup } from '../types/dealer'
import {
  isInvoiceLocked,
  isDeliveryNoteLocked,
  type BelegArchivEntry,
  type BelegArchivType,
  type DeliveryNote,
  type DeliveryNoteWithItems,
  type Dealerish,
  type FreeDeliveryNoteInput,
  type FreeInvoiceInput,
  type Invoice,
  type InvoiceListRow,
  type InvoiceStatus,
  type InvoiceWithItems,
} from '../types/invoice'
import { belegItemsFromNoteItems } from './deliveryNoteCalc'
import { archiveFileName } from './belegArchiveCalc'

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
  deliveryType: 'sale' | 'kommission' = 'sale',
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
      delivery_type: deliveryType,
      shipping_method: ctx.orderShipping?.method ?? null,
      shipping_method_freitext: ctx.orderShipping?.freitext ?? null,
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  // Positionen EINFRIEREN (Snapshot, wie invoice_items): der Lieferschein wird
  // damit unabhängig von den delivery_items der Lieferung und im Entwurf
  // bereinigbar. Die Werte sind identisch zur bisherigen Live-Ableitung →
  // zahlengleich.
  const itemRows = ctx.items.map((i) => ({
    delivery_note_id: note.id,
    product_id: i.product_id,
    description: i.description,
    color: i.color,
    size: i.size,
    quantity: i.quantity,
  }))
  if (itemRows.length > 0) {
    const { error: itErr } = await supabase
      .from('delivery_note_items')
      .insert(itemRows)
    if (itErr) throw itErr
  }

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

/**
 * Freien Lieferschein erstellen (FALL B, ohne Order): delivery_id = null, mit
 * manuell erfassten Positionen (eigene delivery_note_items). Keine Order-
 * Snapshots (Versandart null); Nummernkreis + PDF wie beim order-basierten LS.
 */
export async function createFreeDeliveryNote(
  input: FreeDeliveryNoteInput,
): Promise<DeliveryNote> {
  const org_id = await getMyOrgId()
  const created_by = await getMyUserId()

  const items = input.items
    .map((i) => ({
      description: i.description.trim(),
      color: i.color,
      size: i.size,
      quantity: i.quantity,
    }))
    .filter((i) => i.description !== '' && i.quantity > 0)
  if (items.length === 0) {
    throw new Error('Bitte mindestens eine Position mit Menge erfassen.')
  }

  const { data: dealer, error: dealerErr } = await supabase
    .from('dealers')
    .select('name, contact_name, email, city, country, language')
    .eq('id', input.dealer_id)
    .single()
  if (dealerErr) throw dealerErr
  const lang = pdfLang((dealer as { language: string | null }).language)
  const dealerish: Dealerish = {
    name: dealer.name,
    contact_name: dealer.contact_name,
    email: dealer.email,
    city: dealer.city,
    country: dealer.country,
  }

  const { data: number, error: numErr } = await supabase.rpc(
    'next_delivery_note_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr

  const { data: note, error: insErr } = await supabase
    .from('delivery_notes')
    .insert({
      org_id,
      delivery_id: null,
      dealer_id: input.dealer_id,
      note_number: number as string,
      delivery_type: input.delivery_type,
      notes: input.notes,
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr

  const { error: itErr } = await supabase.from('delivery_note_items').insert(
    items.map((i) => ({
      delivery_note_id: note.id,
      product_id: null,
      description: i.description,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
    })),
  )
  if (itErr) throw itErr

  const { buildDeliveryNotePdf } = await import('./pdf')
  const blob = buildDeliveryNotePdf({
    labels: deliveryNotePdfLabels(lang),
    number: note.note_number,
    date: note.note_date,
    dealer: dealerish,
    seasonLabel: null,
    shipping: null,
    items: items.map((i) => ({
      description: i.description,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
    })),
    notes: input.notes,
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

/**
 * Lieferschein eigenständig versenden (Entwurf → Versendet): sperrt den Beleg
 * und legt ihn ins unveränderbare Archiv. Für freie Lieferscheine (FALL B) und
 * Kommissions-LS, die OHNE Rechnung an den Kunden gehen. Ein order-basierter LS
 * kippt zusätzlich über die Cross-Doc-Sperre beim Rechnungsversand — beide Wege
 * archivieren idempotent.
 */
export async function sendDeliveryNote(id: string): Promise<DeliveryNote> {
  const { data: cur, error: curErr } = await supabase
    .from('delivery_notes')
    .select('status')
    .eq('id', id)
    .single()
  if (curErr) throw curErr
  if (isDeliveryNoteLocked(cur.status)) {
    throw new Error(
      'Dieser Lieferschein ist bereits versendet oder storniert.',
    )
  }

  // Archiv ZUERST (BAO §132), dann Status kippen — schlägt es fehl, bleibt der
  // LS Entwurf (retry-sicher, kein „versendet ohne Archiv").
  await archiveDeliveryNoteById(id)

  const sent_by = await getMyUserId()
  const { data, error } = await supabase
    .from('delivery_notes')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_by })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DeliveryNote
}

/** Lieferschein inkl. eingefrorener Positionen + Händler (Detailansicht). */
export async function getDeliveryNote(
  id: string,
): Promise<DeliveryNoteWithItems> {
  const { data, error } = await supabase
    .from('delivery_notes')
    .select(
      '*, dealer:dealers(name, contact_name, email, city, country), delivery_note_items(*)',
    )
    .eq('id', id)
    .single()
  if (error) throw error
  const note = data as unknown as DeliveryNoteWithItems
  // Positionen stabil nach Anlage sortieren (wie beim Erzeugen).
  note.delivery_note_items = [...(note.delivery_note_items ?? [])].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  )
  return note
}

/** Kontext für die PDF-Neuerzeugung eines Lieferscheins (aus den Snapshots). */
interface DeliveryNoteRegenContext {
  note_number: string
  note_date: string
  dealer: Dealerish
  dealerLanguage: string | null
  seasonLabel: string | null
  shipping_method: string | null
  shipping_method_freitext: string | null
  notes: string | null
  items: { description: string; color: string | null; size: string | null; quantity: number }[]
}

async function loadDeliveryNoteRegenContext(
  id: string,
): Promise<DeliveryNoteRegenContext> {
  const { data, error } = await supabase
    .from('delivery_notes')
    .select(
      'note_number, note_date, shipping_method, shipping_method_freitext, notes, ' +
        'dealer:dealers(name, contact_name, email, city, country, language), ' +
        'delivery:deliveries(production_order:production_orders(season:seasons(label))), ' +
        'delivery_note_items(description, color, size, quantity, created_at)',
    )
    .eq('id', id)
    .single()
  if (error) throw error
  const d = data as unknown as {
    note_number: string
    note_date: string
    shipping_method: string | null
    shipping_method_freitext: string | null
    notes: string | null
    dealer:
      | (Dealerish & { language: string | null })
      | null
    delivery: { production_order: { season: { label: string } | null } | null } | null
    delivery_note_items: {
      description: string
      color: string | null
      size: string | null
      quantity: number
      created_at: string | null
    }[]
  }
  const items = [...(d.delivery_note_items ?? [])].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  )
  return {
    note_number: d.note_number,
    note_date: d.note_date,
    dealer: {
      name: d.dealer?.name ?? 'Unbekannt',
      contact_name: d.dealer?.contact_name ?? null,
      email: d.dealer?.email ?? null,
      city: d.dealer?.city ?? null,
      country: d.dealer?.country ?? null,
    },
    dealerLanguage: d.dealer?.language ?? null,
    seasonLabel: d.delivery?.production_order?.season?.label ?? null,
    shipping_method: d.shipping_method,
    shipping_method_freitext: d.shipping_method_freitext,
    notes: d.notes,
    items: items.map((i) => ({
      description: i.description,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
    })),
  }
}

/**
 * Lieferschein-PDF aus den EINGEFRORENEN Positionen + Kopf-Snapshots bauen
 * (Blob + Kontext). Einzige Quelle für Neudruck UND Archiv.
 */
async function frozenDeliveryNotePdfBlob(
  id: string,
): Promise<{ blob: Blob; ctx: DeliveryNoteRegenContext }> {
  const ctx = await loadDeliveryNoteRegenContext(id)
  const lang = pdfLang(ctx.dealerLanguage)
  const shippingText =
    ctx.shipping_method || ctx.shipping_method_freitext
      ? shippingDisplay(ctx.shipping_method, ctx.shipping_method_freitext, lang)
      : null

  const { buildDeliveryNotePdf } = await import('./pdf')
  const blob = buildDeliveryNotePdf({
    labels: deliveryNotePdfLabels(lang),
    number: ctx.note_number,
    date: ctx.note_date,
    dealer: ctx.dealer,
    seasonLabel: ctx.seasonLabel,
    shipping: shippingText,
    items: belegItemsFromNoteItems(ctx.items),
    notes: ctx.notes,
  })
  return { blob, ctx }
}

/**
 * Lieferschein-PDF neu erzeugen und im Storage (gleicher Pfad = Überschreiben)
 * ablegen. Wird nach jeder Bereinigung im Entwurf aufgerufen.
 */
async function regenerateDeliveryNotePdf(id: string): Promise<void> {
  const org_id = await getMyOrgId()
  const { blob, ctx } = await frozenDeliveryNotePdfBlob(id)
  const path = await uploadPdf(
    org_id,
    `lieferschein-${safeName(ctx.note_number)}.pdf`,
    blob,
  )
  const { error } = await supabase
    .from('delivery_notes')
    .update({ pdf_path: path })
    .eq('id', id)
  if (error) throw error
}

/** Status des Eltern-Lieferscheins einer Position laden; wirft bei gesperrt. */
async function assertDeliveryNoteDraft(noteId: string): Promise<void> {
  const { data, error } = await supabase
    .from('delivery_notes')
    .select('status')
    .eq('id', noteId)
    .single()
  if (error) throw error
  if (isDeliveryNoteLocked(data.status)) {
    throw new Error(
      'Der Lieferschein ist versendet oder storniert und kann nicht mehr geändert werden.',
    )
  }
}

/** Eine eingefrorene Lieferschein-Position im Entwurf löschen (Ware fehlt). */
export async function deleteDeliveryNoteItem(itemId: string): Promise<void> {
  const { data: item, error: itErr } = await supabase
    .from('delivery_note_items')
    .select('delivery_note_id')
    .eq('id', itemId)
    .single()
  if (itErr) throw itErr
  await assertDeliveryNoteDraft(item.delivery_note_id)

  const { error } = await supabase
    .from('delivery_note_items')
    .delete()
    .eq('id', itemId)
  if (error) throw error
  await regenerateDeliveryNotePdf(item.delivery_note_id)
}

/** Menge einer Lieferschein-Position im Entwurf ändern. */
export async function updateDeliveryNoteItemQuantity(
  itemId: string,
  quantity: number,
): Promise<void> {
  const { data: item, error: itErr } = await supabase
    .from('delivery_note_items')
    .select('delivery_note_id')
    .eq('id', itemId)
    .single()
  if (itErr) throw itErr
  await assertDeliveryNoteDraft(item.delivery_note_id)

  const { error } = await supabase
    .from('delivery_note_items')
    .update({ quantity })
    .eq('id', itemId)
  if (error) throw error
  await regenerateDeliveryNotePdf(item.delivery_note_id)
}

/** Notiz eines Lieferscheins im Entwurf setzen (erscheint auf der PDF). */
export async function updateDeliveryNoteNotes(
  id: string,
  notes: string | null,
): Promise<DeliveryNote> {
  await assertDeliveryNoteDraft(id)
  const { data, error } = await supabase
    .from('delivery_notes')
    .update({ notes })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  await regenerateDeliveryNotePdf(id)
  return data as DeliveryNote
}

// ─── Rechnung ────────────────────────────────────────────────────────────────

/**
 * Vorbelegung für die Rechnungserstellung: die aus AB/Händler abgeleiteten
 * Zahlungskonditionen (Session 2), die der Nutzer im Dialog überschreiben kann.
 * Frachtkosten sind separat und starten bei 0.
 */
export async function getInvoiceCreationDefaults(
  deliveryId: string,
): Promise<FrozenInvoiceTerms> {
  const ctx = await loadDeliveryContext(deliveryId)
  return resolveInvoicePaymentTerms(ctx.orderTerms, effectivePaymentTerms(ctx.terms))
}

/**
 * Rechnung aus einer Lieferung erzeugen: fortlaufende Nummer (YYYY-0001),
 * Positionen aus den Lieferpositionen (Großhandelspreis), Steuer aus der
 * Kategorie. Die Nummer wird mit dem Datensatz sofort committet — auch wenn
 * die PDF-Erzeugung fehlschlägt, entsteht keine Lücke.
 *
 * `options` (S3): manuelle Überschreibung der Zahlungskonditionen/Skonto und
 * die Frachtkosten. Frachtkosten sind STEUERWIRKSAM — sie werden dem Warennetto
 * zugeschlagen und mit DEM Steuersatz der Rechnung besteuert (Fracht folgt der
 * Hauptleistung). Ohne options gilt alles wie bisher (Fracht 0, Konditionen aus
 * AB/Händler).
 *
 * Wirft, wenn bereits eine aktive (nicht stornierte) Rechnung zur Lieferung
 * existiert. Nach einer Stornierung wird die neue Rechnung als Ersatz mit der
 * stornierten verknüpft (cancelled_by).
 */
export interface InvoiceCreateOptions extends InvoiceTermOverrides {
  /** Frachtkosten netto (steuerwirksam). Default 0. */
  frachtkosten?: number
}

/** Rechnungs-Quellposition (Netto-Einzelpreis = Großhandelspreis). */
interface InvoiceSourceItem {
  product_id: string | null
  description: string
  color: string | null
  size: string | null
  quantity: number
  wholesale_price: number
}

/**
 * Interner Kern der Rechnungserzeugung. Dealer/Steuer/Konditionen/Versand kommen
 * aus der Lieferung (loadDeliveryContext); die POSITIONEN kommen entweder aus der
 * Lieferung (Standard) oder aus einem `itemsOverride` — so kann die Kommissions-
 * Rechnung aus den (bereinigten) Lieferschein-Positionen erzeugt werden (S6a,
 * Retour-Variante 1), ohne die bewährte Standard-Erzeugung zu verändern.
 */
async function createInvoiceInternal(
  deliveryId: string,
  options: InvoiceCreateOptions | undefined,
  itemsOverride: InvoiceSourceItem[] | undefined,
): Promise<Invoice> {
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
  const items = itemsOverride ?? ctx.items
  if (items.length === 0) {
    throw new Error('Die Lieferung enthält keine Positionen.')
  }

  const subtotal = items.reduce(
    (s, i) => s + i.quantity * i.wholesale_price,
    0,
  )
  // Frachtkosten (manuell, steuerwirksam): dem Warennetto zuschlagen → die USt
  // rechnet auf (Netto + Fracht) mit dem Steuersatz der Rechnung. Negatives wird
  // auf 0 geklemmt (keine negative Fracht).
  const frachtkosten = Math.max(0, options?.frachtkosten ?? 0)
  // Steuer aus der Kategorie ableiten + einfrieren. Blockt VOR der Nummernvergabe
  // (country fehlt / ossMissing / review) → keine verbrauchte Rechnungsnummer.
  const { tax_rate, tax_amount, total, tax_note, tax_category } =
    await deriveInvoiceTax(ctx.taxDealer, subtotal + frachtkosten)

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
      frachtkosten,
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
  // Standard aus AB/Händler, dann die manuellen Überschreibungen (S3) darüber —
  // die zusammengeführten Werte werden eingefroren.
  const terms = applyInvoiceTermOverrides(
    resolveInvoicePaymentTerms(ctx.orderTerms, effectivePaymentTerms(ctx.terms)),
    options,
  )
  const dueDate = addDaysIso(invoice.invoice_date, terms.zahlungsziel_tage)

  const itemRows = items.map((i) => ({
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
    items: items.map((i) => ({
      description: i.description,
      color: i.color,
      size: i.size,
      quantity: i.quantity,
      unitPrice: i.wholesale_price,
      lineTotal: i.quantity * i.wholesale_price,
    })),
    subtotal,
    frachtkosten,
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
 * Rechnung aus einer Lieferung erzeugen (Standardweg): Positionen = die
 * Lieferpositionen. `options` (S3) überschreibt Konditionen/Fracht. Verhalten
 * unverändert zum bisherigen createInvoice (itemsOverride = undefined).
 */
export async function createInvoice(
  deliveryId: string,
  options?: InvoiceCreateOptions,
): Promise<Invoice> {
  return createInvoiceInternal(deliveryId, options, undefined)
}

/**
 * Rechnung aus einem LIEFERSCHEIN erzeugen (S6a, Kommission-Retour Variante 1):
 * die Positionen kommen aus den (ggf. im Entwurf bereinigten) Lieferschein-
 * Positionen — „Rechnung aus dem bereinigten LS". Netto-Einzelpreis = aktueller
 * Großhandelspreis des Produkts. Danach wird die Rechnung wie üblich versendet
 * (setInvoiceStatus) — das sperrt den Kommissions-LS und archiviert beide.
 */
export async function createInvoiceFromDeliveryNote(
  noteId: string,
  options?: InvoiceCreateOptions,
): Promise<Invoice> {
  const { data: note, error: noteErr } = await supabase
    .from('delivery_notes')
    .select('delivery_id, status')
    .eq('id', noteId)
    .single()
  if (noteErr) throw noteErr
  if (note.status === 'cancelled') {
    throw new Error('Der Lieferschein ist storniert.')
  }
  if (!note.delivery_id) {
    throw new Error('Der Lieferschein hat keine zugeordnete Lieferung.')
  }

  const { data: rows, error: itErr } = await supabase
    .from('delivery_note_items')
    .select('id, product_id, description, color, size, quantity, product:products(wholesale_price)')
    .eq('delivery_note_id', noteId)
    .order('created_at', { ascending: true })
  if (itErr) throw itErr

  // LS-verankerte Rücksendungen (Kommission Variante 2) mindern die zu
  // fakturierende Menge je Position — „Rechnung nur über die verkauften Artikel".
  // Bei Variante 1 (LS-Positionen direkt reduziert) gibt es keine LS-Retouren →
  // dann ändert das nichts. Beide Wege fakturieren so die BEHALTENE Menge.
  const returned = await returnedQuantitiesByDeliveryNote(noteId)

  const items: InvoiceSourceItem[] = []
  for (const r of rows ?? []) {
    const row = r as unknown as {
      id: string
      product_id: string | null
      description: string
      color: string | null
      size: string | null
      quantity: number
      product: { wholesale_price: number | string | null } | null
    }
    const kept = (row.quantity ?? 0) - (returned.get(row.id) ?? 0)
    if (kept <= 0) continue
    items.push({
      product_id: row.product_id,
      description: row.description,
      color: row.color,
      size: row.size,
      quantity: kept,
      wholesale_price: num(row.product?.wholesale_price ?? 0),
    })
  }
  if (items.length === 0) {
    throw new Error(
      'Nach Abzug der Rücksendungen bleiben keine zu fakturierenden Positionen.',
    )
  }

  return createInvoiceInternal(note.delivery_id as string, options, items)
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

/**
 * Rechnungs-PDF aus den EINGEFRORENEN Rechnungswerten bauen (Blob). Einzige
 * Quelle der PDF-Erzeugung für Neudruck UND Archiv — so ist die archivierte PDF
 * identisch zur nachdruckbaren. Zahlungsziel aus dem eingefrorenen due_date
 * zurückgerechnet; Altbestände ohne Snapshot fallen pro Feld auf den WARM-ME-
 * Standard zurück (genau so wurden sie gedruckt).
 */
async function frozenInvoicePdfBlob(inv: InvoiceWithItems): Promise<Blob> {
  const terms = effectivePaymentTerms({
    skonto_prozent: inv.skonto_prozent,
    skonto_tage: inv.skonto_tage,
    zahlungsziel_tage: inv.due_date
      ? daysBetweenIso(inv.invoice_date, inv.due_date)
      : null,
  })
  const total = num(inv.total)
  const dealerLang = (inv.dealer as (Dealerish & { language?: string | null }) | null)
    ?.language
  const { buildInvoicePdf } = await import('./pdf')
  return buildInvoicePdf({
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
    // Eingefrorene Fracht (Altbelege 0 → keine Zeile, zahlengleich).
    frachtkosten: num(inv.frachtkosten),
    tax: num(inv.tax_amount),
    taxRate: num(inv.tax_rate),
    total,
    taxNote: inv.tax_note ?? null,
    zahlungszielTage: terms.zahlungsziel_tage,
    skonto: skontoForPdf(inv.invoice_date, total, terms),
    paymentTermsFreitext: inv.zahlungsbedingung_freitext ?? null,
    notes: inv.notes,
  })
}

/** PDF einer bestehenden Rechnung neu erzeugen (z. B. nach fehlgeschlagenem Upload). */
export async function regenerateInvoicePdf(id: string): Promise<Invoice> {
  const org_id = await getMyOrgId()
  const inv = await getInvoice(id)
  const blob = await frozenInvoicePdfBlob(inv)
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

// ─── Beleg-Archiv (S4, BAO §132 — unveränderbar) ─────────────────────────────

const ARCHIVE_BUCKET = 'belege-archiv'

/** Prüft, ob für einen Beleg bereits ein Archiveintrag existiert. */
async function isArchived(
  documentType: BelegArchivType,
  documentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('belege_archiv')
    .select('id')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

/**
 * Eine finale PDF unveränderbar ins Archiv legen: write-once in den Bucket
 * belege-archiv (upsert:false) + Metadaten-Zeile. Idempotent — existiert bereits
 * ein Eintrag zum Beleg, passiert nichts (kein Überschreiben).
 */
async function archiveDocument(params: {
  orgId: string
  documentType: BelegArchivType
  documentId: string
  belegnummer: string
  dealerName: string | null
  belegDatum: string | null
  blob: Blob
}): Promise<void> {
  if (await isArchived(params.documentType, params.documentId)) return

  const filename = archiveFileName(
    params.belegnummer,
    params.dealerName,
    params.belegDatum,
  )
  const path = `${params.orgId}/${params.documentType}/${filename}`
  // Write-once: kein upsert → ein bereits vorhandenes Objekt wird NICHT ersetzt.
  const { error: upErr } = await supabase.storage
    .from(ARCHIVE_BUCKET)
    .upload(path, params.blob, {
      contentType: 'application/pdf',
      upsert: false,
    })
  // Existiert die Datei schon (paralleler Lauf), gilt das Archiv als vorhanden.
  if (upErr && !/exists/i.test(upErr.message)) throw upErr

  const created_by = await getMyUserId()
  const { error: insErr } = await supabase.from('belege_archiv').insert({
    org_id: params.orgId,
    document_type: params.documentType,
    document_id: params.documentId,
    belegnummer: params.belegnummer,
    dealer_name: params.dealerName,
    beleg_datum: params.belegDatum,
    storage_path: path,
    content_type: 'application/pdf',
    file_size: params.blob.size,
    created_by,
  })
  // Unique-Index (org, type, id): ein paralleler Zweit-Insert ist ok (bereits da).
  if (insErr && !/duplicate|unique/i.test(insErr.message)) throw insErr
}

/** Eine Rechnung ins Archiv legen (aus den eingefrorenen Werten). */
export async function archiveInvoiceById(invoiceId: string): Promise<void> {
  const org_id = await getMyOrgId()
  const inv = await getInvoice(invoiceId)
  const blob = await frozenInvoicePdfBlob(inv)
  await archiveDocument({
    orgId: org_id,
    documentType: 'invoice',
    documentId: inv.id,
    belegnummer: inv.invoice_number,
    dealerName: inv.dealer?.name ?? null,
    belegDatum: inv.invoice_date,
    blob,
  })
}

/** Einen Lieferschein ins Archiv legen (aus den eingefrorenen Positionen). */
export async function archiveDeliveryNoteById(noteId: string): Promise<void> {
  const org_id = await getMyOrgId()
  const { blob, ctx } = await frozenDeliveryNotePdfBlob(noteId)
  await archiveDocument({
    orgId: org_id,
    documentType: 'delivery_note',
    documentId: noteId,
    belegnummer: ctx.note_number,
    dealerName: ctx.dealer.name,
    belegDatum: ctx.note_date,
    blob,
  })
}

/** Archiveintrag eines Belegs laden (oder null) — auch nach Storno abrufbar. */
export async function getBelegArchiv(
  documentType: BelegArchivType,
  documentId: string,
): Promise<BelegArchivEntry | null> {
  const { data, error } = await supabase
    .from('belege_archiv')
    .select('*')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .maybeSingle()
  if (error) throw error
  return (data as BelegArchivEntry | null) ?? null
}

/** Signierte Download-URL für ein archiviertes PDF (privater Bucket). */
export async function signedArchiveUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ARCHIVE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL)
  if (error || !data) throw error ?? new Error('URL konnte nicht erzeugt werden.')
  return data.signedUrl
}

// ─── Rechnungskorrektur (S7) ─────────────────────────────────────────────────

/**
 * Formalen Rechnungskorrektur-Beleg zu einer rechnungs-verankerten Retoure
 * erstellen: lückenlose Nummer RK-YYYY-NNNN + PDF (Minusbeträge, aus den
 * EINGEFRORENEN Retouren-Summen), in returns.credit_note_number/pdf_path
 * eingefroren und ins Archiv (document_type 'correction') gelegt. Idempotent —
 * ist bereits eine Korrektur ausgestellt, wird sie unverändert zurückgegeben.
 * Nur für recorded, rechnungs-verankerte Retouren (LS-Retouren sind mangels
 * Fakturierung nicht monetär und bekommen keine Korrektur).
 */
export async function issueInvoiceCorrection(returnId: string): Promise<Return> {
  const org_id = await getMyOrgId()
  const { data, error } = await supabase
    .from('returns')
    .select(
      '*, return_items(*, invoice_item:invoice_items(description)), ' +
        'invoice:invoices(invoice_number), ' +
        'dealer:dealers(name, contact_name, email, city, country, language)',
    )
    .eq('id', returnId)
    .single()
  if (error) throw error
  const ret = data as unknown as Return & {
    return_items: {
      product_id: string | null
      color: string | null
      size: string | null
      quantity: number
      unit_price: number | string
      line_total: number | string
      invoice_item: { description: string } | null
    }[]
    invoice: { invoice_number: string } | null
    dealer: (Dealerish & { language: string | null }) | null
  }

  if (ret.status !== 'recorded') {
    throw new Error('Nur eine erfasste (nicht stornierte) Retoure kann korrigiert werden.')
  }
  if (!ret.invoice_id || !ret.invoice) {
    throw new Error('Eine Rechnungskorrektur braucht eine rechnungs-verankerte Retoure.')
  }
  if (ret.credit_note_number) {
    // Bereits ausgestellt → unverändert zurückgeben (idempotent).
    return ret as Return
  }

  const dealerish: Dealerish = {
    name: ret.dealer?.name ?? 'Unbekannt',
    contact_name: ret.dealer?.contact_name ?? null,
    email: ret.dealer?.email ?? null,
    city: ret.dealer?.city ?? null,
    country: ret.dealer?.country ?? null,
  }

  const { data: number, error: numErr } = await supabase.rpc(
    'next_correction_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr
  const correctionNumber = number as string

  const totals = correctionTotals(ret.subtotal_net, ret.tax_amount, ret.total_amount)
  const { buildCorrectionPdf } = await import('./pdf')
  const blob = buildCorrectionPdf({
    labels: correctionPdfLabels(pdfLang(ret.dealer?.language ?? null)),
    number: correctionNumber,
    date: ret.return_date,
    dealer: dealerish,
    originalInvoiceNumber: ret.invoice.invoice_number,
    items: ret.return_items.map((i) => ({
      description: i.invoice_item?.description ?? '—',
      color: i.color,
      size: i.size,
      quantity: i.quantity,
      unitPrice: num(i.unit_price),
      lineTotal: num(i.line_total),
    })),
    subtotal: totals.net,
    tax: totals.tax,
    taxRate: num(ret.tax_rate),
    total: totals.gross,
    taxNote: ret.tax_note,
    reason: ret.reason,
  })

  const path = await uploadPdf(
    org_id,
    `rechnungskorrektur-${safeName(correctionNumber)}.pdf`,
    blob,
  )
  const { data: updated, error: upErr } = await supabase
    .from('returns')
    .update({ credit_note_number: correctionNumber, pdf_path: path })
    .eq('id', returnId)
    .select()
    .single()
  if (upErr) throw upErr

  // Ins unveränderbare Archiv (BAO §132) — document_type 'correction' (S4).
  await archiveDocument({
    orgId: org_id,
    documentType: 'correction',
    documentId: returnId,
    belegnummer: correctionNumber,
    dealerName: dealerish.name,
    belegDatum: ret.return_date,
    blob,
  })

  return updated as Return
}

/**
 * Freie Rechnungskorrektur OHNE Bezug (S7b): eine ankerlose returns-Zeile
 * (invoice_id + delivery_note_id null) mit manuell erfassten Positionen, direkt
 * mit RK-Nummer + PDF (Minusbeträge) + Archiv. Steuersatz aus dem Kunden
 * abgeleitet (wie freie Rechnung). Die Nummer wird nach der Steuerprüfung
 * gezogen (kein verbrauchter RK-Kreis bei Steuerblock).
 */
export async function createFreeCorrection(
  input: CreateFreeCorrectionInput,
): Promise<Return> {
  const org_id = await getMyOrgId()
  const created_by = await getMyUserId()

  const lines = input.lines
    .map((l) => ({
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price: l.unit_price,
    }))
    .filter((l) => l.description !== '' && l.quantity > 0)
  if (lines.length === 0) {
    throw new Error('Bitte mindestens eine Position mit Menge erfassen.')
  }

  const { data: dealer, error: dealerErr } = await supabase
    .from('dealers')
    .select('name, contact_name, email, city, country, customer_group, country_iso2, uid, language')
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

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  // Steuer aus der Kundenkategorie ableiten (blockt VOR der Nummernvergabe).
  const { tax_rate, tax_note } = await deriveInvoiceTax(
    {
      customer_group: (dealer.customer_group ?? 'b2b') as CustomerGroup,
      country_iso2: dealer.country_iso2 ?? null,
      uid: dealer.uid ?? null,
      language: dealer.language ?? null,
    },
    subtotal,
  )
  const amounts = returnTotal(lines, tax_rate)

  const { data: number, error: numErr } = await supabase.rpc(
    'next_correction_number',
    { p_org_id: org_id },
  )
  if (numErr) throw numErr
  const correctionNumber = number as string

  const { data: created, error: insErr } = await supabase
    .from('returns')
    .insert({
      org_id,
      invoice_id: null,
      delivery_note_id: null,
      dealer_id: input.dealer_id,
      return_date: input.return_date,
      reason: input.reason ?? null,
      subtotal_net: amounts.net,
      tax_rate,
      tax_amount: amounts.tax,
      total_amount: amounts.gross,
      tax_note,
      status: 'recorded',
      credit_note_number: correctionNumber,
      created_by,
    })
    .select()
    .single()
  if (insErr) throw insErr
  const ret = created as unknown as Return

  const { error: itErr } = await supabase.from('return_items').insert(
    lines.map((l) => ({
      return_id: ret.id,
      invoice_item_id: null,
      delivery_note_item_id: null,
      description: l.description,
      product_id: null,
      color: null,
      size: null,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: Math.round(l.quantity * l.unit_price * 100) / 100,
    })),
  )
  if (itErr) throw itErr

  const totals = correctionTotals(amounts.net, amounts.tax, amounts.gross)
  const { buildCorrectionPdf } = await import('./pdf')
  const blob = buildCorrectionPdf({
    labels: correctionPdfLabels(pdfLang((dealer as { language: string | null }).language)),
    number: correctionNumber,
    date: ret.return_date,
    dealer: dealerish,
    originalInvoiceNumber: null,
    items: lines.map((l) => ({
      description: l.description,
      color: null,
      size: null,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      lineTotal: Math.round(l.quantity * l.unit_price * 100) / 100,
    })),
    subtotal: totals.net,
    tax: totals.tax,
    taxRate: tax_rate,
    total: totals.gross,
    taxNote: tax_note,
    reason: ret.reason,
  })

  const path = await uploadPdf(org_id, `rechnungskorrektur-${safeName(correctionNumber)}.pdf`, blob)
  const { data: updated, error: upErr } = await supabase
    .from('returns')
    .update({ pdf_path: path })
    .eq('id', ret.id)
    .select()
    .single()
  if (upErr) throw upErr

  await archiveDocument({
    orgId: org_id,
    documentType: 'correction',
    documentId: ret.id,
    belegnummer: correctionNumber,
    dealerName: dealerish.name,
    belegDatum: ret.return_date,
    blob,
  })

  return updated as Return
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
  // Nur ein Entwurf kann versendet werden. Ab Versand ist die Rechnung
  // eingefroren (read-only) — Korrektur nur über Storno + Neubeleg. Sichtbarer
  // Fehler statt stiller Doppel-Versendung.
  const { data: cur, error: curErr } = await supabase
    .from('invoices')
    .select('status, delivery_id')
    .eq('id', id)
    .single()
  if (curErr) throw curErr
  if (isInvoiceLocked(cur.status)) {
    throw new Error(
      'Diese Rechnung ist bereits versendet oder storniert und kann nicht erneut versendet werden.',
    )
  }

  // Die Lieferscheine derselben Lieferung, die mit diesem Versand gesperrt
  // werden (noch Entwurf). Sie werden — wie die Rechnung — mitarchiviert.
  const noteIdsToLock: string[] = []
  if (cur.delivery_id) {
    const { data: draftNotes, error: dnErr } = await supabase
      .from('delivery_notes')
      .select('id')
      .eq('delivery_id', cur.delivery_id)
      .eq('status', 'draft')
    if (dnErr) throw dnErr
    for (const n of draftNotes ?? []) noteIdsToLock.push((n as { id: string }).id)
  }

  // ARCHIV ZUERST (BAO §132): finale PDFs aus den eingefrorenen Snapshots
  // unveränderbar ablegen, BEVOR der Status kippt. Schlägt das Archivieren fehl,
  // bleibt alles Entwurf → sauber wiederholbar, keine „versendet ohne Archiv".
  // Idempotent — ein zweiter Lauf legt nichts doppelt ab.
  await archiveInvoiceById(id)
  for (const noteId of noteIdsToLock) await archiveDeliveryNoteById(noteId)

  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  // Cross-Doc-Sperre: sobald die Rechnung versendet ist, wird der zugehörige
  // Lieferschein derselben Lieferung ebenfalls gesperrt (nur offene Entwürfe
  // kippen — versendete/stornierte bleiben unberührt). Idempotent über
  // .eq('status','draft').
  if (cur.delivery_id) {
    const sent_by = await getMyUserId()
    const { error: lockErr } = await supabase
      .from('delivery_notes')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_by })
      .eq('delivery_id', cur.delivery_id)
      .eq('status', 'draft')
    if (lockErr) throw lockErr
  }

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
  // Zahlungserfassung ist ein legitimer Folgeschritt NACH dem Versand — daher
  // KEINE isInvoiceLocked-Sperre (die würde „versendet" blocken). Nur eine
  // stornierte Rechnung darf nicht als bezahlt markiert werden.
  const { data: cur, error: curErr } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', id)
    .single()
  if (curErr) throw curErr
  if (cur.status === 'cancelled') {
    throw new Error(
      'Eine stornierte Rechnung kann nicht als bezahlt markiert werden.',
    )
  }

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
  // Storno ist der Ausweg aus jedem aktiven Zustand (Entwurf/Versendet/Bezahlt)
  // — die Nummer bleibt erhalten (kein Löschen). Nur ein bereits stornierter
  // Beleg wird nicht ein zweites Mal storniert.
  const { data: cur, error: curErr } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', id)
    .single()
  if (curErr) throw curErr
  if (cur.status === 'cancelled') {
    throw new Error('Diese Rechnung ist bereits storniert.')
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Invoice
}

/**
 * Lieferschein stornieren (Storno statt Löschen). Die Nummer bleibt erhalten;
 * Metadaten (Zeitpunkt/Benutzer/Grund) werden festgehalten. Ein bereits
 * stornierter Lieferschein wird nicht erneut storniert. Der Grund ist optional.
 */
export async function cancelDeliveryNote(
  id: string,
  reason: string | null,
): Promise<DeliveryNote> {
  const cancelled_by = await getMyUserId()
  const { data: cur, error: curErr } = await supabase
    .from('delivery_notes')
    .select('status')
    .eq('id', id)
    .single()
  if (curErr) throw curErr
  if (cur.status === 'cancelled') {
    throw new Error('Dieser Lieferschein ist bereits storniert.')
  }

  const { data, error } = await supabase
    .from('delivery_notes')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by,
      cancelled_reason: reason,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DeliveryNote
}
