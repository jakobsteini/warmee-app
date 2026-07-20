/**
 * Rechnungs-Status (englisch gespeichert, wie in der DB-Check-Constraint).
 * Flow: Entwurf → Versendet → Bezahlt. Eine versendete Rechnung ist
 * unveränderlich und kann nur noch storniert werden (→ Storniert).
 */
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'cancelled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** Deutsche UI-Labels für die Rechnungs-Status. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Entwurf',
  sent: 'Versendet',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
}

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status as InvoiceStatus] ?? status
}

/** Eine Rechnung (snake_case wie in der DB). */
export interface Invoice {
  id: string
  org_id: string
  /** Zugrundeliegende Lieferung – null bei einer freien Rechnung (#7). */
  delivery_id: string | null
  dealer_id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  /** Eingefrorener Skontosatz zum Rechnungszeitpunkt (Snapshot wie due_date). numeric(5,2). */
  skonto_prozent: number | string | null
  /** Eingefrorene Skontofrist in Tagen zum Rechnungszeitpunkt. */
  skonto_tage: number | null
  /** numeric(10,2) – kann als number oder string ankommen. */
  subtotal: number | string
  tax_rate: number | string
  tax_amount: number | string
  total: number | string
  /** Eingefrorener Pflichthinweis (Reverse Charge / Ausfuhr); null bei Inland/Altbelegen. */
  tax_note: string | null
  /** Eingefrorene Steuerkategorie (Audit-Snapshot); null bei Altbelegen. */
  tax_category: string | null
  status: InvoiceStatus
  /** Tatsächliches Zahlungsdatum (maßgebliche Quelle des Bezahlt-Zustands). */
  paid_at: string | null
  /** Gezahlter Bruttobetrag; numeric(10,2). Ohne Teilzahlungen = voller Betrag. */
  paid_amount: number | string | null
  cancelled_by: string | null
  notes: string | null
  pdf_path: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/** Eine Rechnungsposition (snake_case wie in der DB). */
export interface InvoiceItem {
  id: string
  invoice_id: string
  product_id: string | null
  description: string
  color: string | null
  size: string | null
  quantity: number
  unit_price: number | string
  line_total: number | string
  created_at: string | null
}

/**
 * Rechnung für die Übersichtsseite: mit Händlername und -Zahlungsziel.
 * zahlungsziel_tage wird für die gemeinsame Fälligkeitslogik (dueDates)
 * mitgeladen — Fallback, falls die Rechnung (noch) kein due_date trägt.
 */
export interface InvoiceListRow extends Invoice {
  dealer: { name: string; zahlungsziel_tage: number | null } | null
  /**
   * Offener Rest BRUTTO = total − Σ recorded Retouren (zentral über
   * returnsCalc.openAfterReturns). Nur für offene Rechnungen (Entwurf/Versendet)
   * aussagekräftig; bei bezahlten/stornierten wird er nicht gerendert.
   */
  open_amount: number
}

/** Eine Rechnung inkl. Händlerdaten und Positionen (Detailansicht). */
export interface InvoiceWithItems extends Invoice {
  dealer: Dealerish | null
  invoice_items: InvoiceItem[]
}

/** Eine manuell erfasste Position einer freien Rechnung (#7). */
export interface FreeInvoiceItemInput {
  description: string
  quantity: number
  /** Einzelpreis netto. */
  unit_price: number
}

/** Eingaben zum Erstellen einer freien Rechnung (ohne Lieferung). */
export interface FreeInvoiceInput {
  dealer_id: string
  items: FreeInvoiceItemInput[]
  notes: string | null
}

/** Ein Lieferschein-Kopf (snake_case wie in der DB). */
export interface DeliveryNote {
  id: string
  org_id: string
  delivery_id: string
  dealer_id: string
  note_number: string
  note_date: string
  notes: string | null
  pdf_path: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/** Händlerdaten, wie sie auf Beleg-PDFs gebraucht werden. */
export interface Dealerish {
  name: string
  contact_name: string | null
  email: string | null
  city: string | null
  country: string | null
}
