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

/**
 * Kleinunternehmer-Hinweis (Österreich). Steht auf jeder Rechnung, solange
 * keine USt ausgewiesen wird (tax_rate = 0).
 */
export const KLEINUNTERNEHMER_HINWEIS =
  'Umsatzsteuerbefreit gemäß § 6 Abs. 1 Z 27 UStG'

/** Eine Rechnung (snake_case wie in der DB). */
export interface Invoice {
  id: string
  org_id: string
  delivery_id: string
  dealer_id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  /** numeric(10,2) – kann als number oder string ankommen. */
  subtotal: number | string
  tax_rate: number | string
  tax_amount: number | string
  total: number | string
  status: InvoiceStatus
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

/** Rechnung für die Übersichtsseite: mit Händlername. */
export interface InvoiceListRow extends Invoice {
  dealer: { name: string } | null
}

/** Eine Rechnung inkl. Händlerdaten und Positionen (Detailansicht). */
export interface InvoiceWithItems extends Invoice {
  dealer: Dealerish | null
  invoice_items: InvoiceItem[]
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
