import type { ReturnStatus } from '../lib/returnsCalc'

export type { ReturnStatus }

/** Ein Retouren-Vorgang (snake_case wie in der DB). */
export interface Return {
  id: string
  org_id: string
  /** Verankerung an der Rechnung (XOR mit delivery_note_id). Null bei LS-Retoure. */
  invoice_id: string | null
  /** Verankerung am Lieferschein (Kommission, nie fakturiert). Null bei Rechnungs-Retoure. */
  delivery_note_id: string | null
  dealer_id: string
  return_date: string
  reason: string | null
  /** Eingefrorene Nettosumme der Positionen; numeric(10,2). */
  subtotal_net: number | string
  /** Eingefrorener Steuersatz als Faktor (0.20); numeric(5,2). */
  tax_rate: number | string
  /** Eingefrorene ausgewiesene USt; numeric(10,2). */
  tax_amount: number | string
  /** Eingefrorene Gutschrift-Summe BRUTTO (Netto + USt); numeric(10,2). */
  total_amount: number | string
  /** Eingefrorener Pflichthinweis (Reverse Charge / Ausfuhr); null bei Inland. */
  tax_note: string | null
  status: ReturnStatus
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  /** Beleg-Schicht, vorerst ungenutzt. */
  credit_note_number: string | null
  pdf_path: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/** Eine Retouren-Position (snake_case wie in der DB). */
export interface ReturnItem {
  id: string
  return_id: string
  /** Herkunft = Rechnungsposition (Rechnungs-Retoure) ODER … */
  invoice_item_id: string | null
  /** … Lieferschein-Position (LS-Retoure). Genau eine der beiden ist gesetzt. */
  delivery_note_item_id: string | null
  /** Freitext-Bezeichnung (freie Korrektur); null bei verankerten Zeilen. */
  description: string | null
  product_id: string | null
  color: string | null
  size: string | null
  quantity: number
  unit_price: number | string
  line_total: number | string
  created_at: string | null
}

/** Ein Retouren-Vorgang inkl. Positionen. */
export interface ReturnWithItems extends Return {
  return_items: ReturnItem[]
}

/** Eine Rechnungsposition mit noch retournierbarer Menge (für die Erfassung). */
export interface ReturnableLine {
  invoice_item_id: string
  description: string
  product_id: string | null
  color: string | null
  size: string | null
  /** Berechnete Menge auf der Rechnung. */
  invoiced_quantity: number
  /** Bereits (recorded) retourniert. */
  returned_quantity: number
  /** Noch retournierbar. */
  remaining_quantity: number
  unit_price: number | string
}

/** Kontext für die Retouren-Erfassung zu einer Rechnung. */
export interface InvoiceReturnContext {
  lines: ReturnableLine[]
  returns: ReturnWithItems[]
}

/** Eine zu erfassende Retouren-Zeile. */
export interface CreateReturnLine {
  invoice_item_id: string
  quantity: number
}

/** Eingaben zum Erfassen einer Retoure. */
export interface CreateReturnInput {
  invoice_id: string
  /** Optionales Retouren-Datum (Default: heute, per DB). */
  return_date?: string
  reason?: string | null
  lines: CreateReturnLine[]
}

/**
 * Eine Lieferschein-Position mit noch retournierbarer Menge (LS-Retoure,
 * Kommission Variante 2). Mengen ohne Beträge — die Ware wurde nie fakturiert.
 */
export interface DeliveryNoteReturnableLine {
  delivery_note_item_id: string
  description: string
  product_id: string | null
  color: string | null
  size: string | null
  /** Gelieferte Menge laut Lieferschein-Position. */
  delivered_quantity: number
  /** Bereits (recorded) zurückgesendet. */
  returned_quantity: number
  /** Noch retournierbar. */
  remaining_quantity: number
}

/** Kontext für die LS-Retouren-Erfassung. */
export interface DeliveryNoteReturnContext {
  lines: DeliveryNoteReturnableLine[]
  returns: ReturnWithItems[]
}

/** Eine zu erfassende LS-Retouren-Zeile. */
export interface CreateDeliveryNoteReturnLine {
  delivery_note_item_id: string
  quantity: number
}

/** Eingaben zum Erfassen einer LS-Retoure (Kommission Variante 2). */
export interface CreateDeliveryNoteReturnInput {
  delivery_note_id: string
  return_date?: string
  reason?: string | null
  lines: CreateDeliveryNoteReturnLine[]
}

/** Eine manuell erfasste Zeile einer freien Rechnungskorrektur (S7b). */
export interface FreeCorrectionLine {
  description: string
  quantity: number
  /** Netto-Einzelpreis (positiv; auf dem Beleg als Minus ausgewiesen). */
  unit_price: number
}

/** Eingaben zum Erstellen einer freien Rechnungskorrektur (ohne Bezug). */
export interface CreateFreeCorrectionInput {
  dealer_id: string
  return_date?: string
  reason?: string | null
  lines: FreeCorrectionLine[]
}
