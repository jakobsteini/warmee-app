import type { TranslationKey } from '../i18n/dict'

/** Mögliche Order-Status (englisch gespeichert, wie in der DB-Check-Constraint). */
export const ORDER_STATUSES = ['draft', 'submitted', 'confirmed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// ─── Kopfdaten-Dropdowns (app-seitig validiert, kein DB-CHECK; erweiterbar) ───

/** Order-Art. */
export const ORDER_TYPES = ['vororder', 'prompt', 'lager'] as const
/** Versandart (erweiterbar). */
export const SHIPPING_METHODS = ['dpd', 'dsv'] as const
/** Versand-/Lieferkondition (gemeinsamer Wertebereich, zwei getrennte Felder). */
export const ORDER_TERMS = ['ab_werk', 'frei_haus'] as const

/** i18n-Label-Keys der Dropdown-Werte (via t() aufgelöst). */
export const ORDER_TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  vororder: 'order.type.vororder',
  prompt: 'order.type.prompt',
  lager: 'order.type.lager',
}
export const SHIPPING_METHOD_LABEL_KEYS: Record<string, TranslationKey> = {
  dpd: 'order.shipMethod.dpd',
  dsv: 'order.shipMethod.dsv',
}
export const ORDER_TERM_LABEL_KEYS: Record<string, TranslationKey> = {
  ab_werk: 'order.terms.abWerk',
  frei_haus: 'order.terms.freiHaus',
}

/** Editierbare Kopfdaten der Order (Anlage + Bearbeitung). Alle optional. */
export interface OrderHeadFields {
  order_type: string | null
  shipping_method: string | null
  /** Versandkondition. */
  shipping_terms: string | null
  /** Lieferkondition. */
  delivery_terms: string | null
  /** Lieferzeitraum von (ISO-Datum) — optional. */
  delivery_date_from: string | null
  /** Lieferzeitraum bis (ISO-Datum) — optional; App erzwingt from<=to. */
  delivery_date_to: string | null
  /** Kunden-Auftragsnummer / Freitext (separat von notes). */
  po_number: string | null
  /** Prioritäts-Häkchen: später bei der Warenverteilung bevorzugt (heute nur Feld). */
  priority: boolean
}

/** Formular-Zustand der Kopfdaten (Strings + das Prioritäts-Boolean). */
export interface OrderHeadForm {
  order_type: string
  shipping_method: string
  shipping_terms: string
  delivery_terms: string
  delivery_date_from: string
  delivery_date_to: string
  po_number: string
  priority: boolean
}

export const emptyOrderHead: OrderHeadForm = {
  order_type: '',
  shipping_method: '',
  shipping_terms: '',
  delivery_terms: '',
  delivery_date_from: '',
  delivery_date_to: '',
  po_number: '',
  priority: false,
}

/** Bestehende Order-Kopfdaten → Formular (für die Bearbeitung). */
export function orderHeadToForm(o: OrderHeadFields): OrderHeadForm {
  return {
    order_type: o.order_type ?? '',
    shipping_method: o.shipping_method ?? '',
    shipping_terms: o.shipping_terms ?? '',
    delivery_terms: o.delivery_terms ?? '',
    delivery_date_from: o.delivery_date_from ?? '',
    delivery_date_to: o.delivery_date_to ?? '',
    po_number: o.po_number ?? '',
    priority: o.priority ?? false,
  }
}

/** Formular → DB-Felder (leer → null; priority als Boolean). */
export function orderHeadFromForm(f: OrderHeadForm): OrderHeadFields {
  const orNull = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    order_type: orNull(f.order_type),
    shipping_method: orNull(f.shipping_method),
    shipping_terms: orNull(f.shipping_terms),
    delivery_terms: orNull(f.delivery_terms),
    delivery_date_from: orNull(f.delivery_date_from),
    delivery_date_to: orNull(f.delivery_date_to),
    po_number: orNull(f.po_number),
    priority: f.priority,
  }
}

/**
 * Lieferzeitraum-Prüfung: gültig, solange nicht BEIDE Daten gesetzt sind und
 * from > to. Beide optional; nur die echte Verletzung (from > to) ist ungültig.
 * ISO-Kurzdaten sind lexikografisch vergleichbar.
 */
export function orderHeadDateRangeOk(f: OrderHeadForm): boolean {
  if (f.delivery_date_from === '' || f.delivery_date_to === '') return true
  return f.delivery_date_from <= f.delivery_date_to
}

/**
 * Zuteilung einer Order (Grundlage der Provision): der deutschen Agentin
 * (provisionsrelevant) oder WARM ME intern (keine Provision). Englisch/snake_case
 * wie die DB-Check-Constraint.
 */
export const ORDER_ASSIGNMENTS = ['agent', 'internal'] as const
export type OrderAssignment = (typeof ORDER_ASSIGNMENTS)[number]

/** Deutsche UI-Labels für die Status. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Entwurf',
  submitted: 'Eingereicht',
  confirmed: 'Bestätigt',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrderStatus] ?? status
}

/**
 * Status-Reihenfolge Entwurf → Eingereicht → Bestätigt.
 * Gibt den nächsten Status zurück, oder null wenn bereits bestätigt.
 */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const idx = ORDER_STATUSES.indexOf(status)
  return idx >= 0 && idx < ORDER_STATUSES.length - 1
    ? ORDER_STATUSES[idx + 1]
    : null
}

/** Eine Order-Zeile (snake_case wie in der DB). */
export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  /** numeric(10,2) – kann als number oder string ankommen. */
  unit_price: number | string | null
  created_at: string | null
}

/** Order-Zeile inkl. mitgeladenem Produkt (für die Bearbeitungsseite). */
export interface OrderItemWithProduct extends OrderItem {
  product: { name: string; color: string[] | null } | null
}

/** Felder zum Anlegen einer Order-Zeile (order_id/id kommen separat). */
export interface OrderItemInput {
  product_id: string
  color: string | null
  size: string | null
  quantity: number
  unit_price: number | null
}

/** Eine Order (snake_case wie in der DB). */
export interface Order extends OrderHeadFields {
  id: string
  org_id: string
  dealer_id: string
  season_id: string
  /** Auftragsnummer AB-YYYY-NNNN; NULL bis zur Bestätigung (confirmed). */
  order_number: string | null
  status: OrderStatus
  /** Provisions-Zuteilung; NOT NULL DEFAULT 'internal' in der DB. */
  assignment: OrderAssignment
  notes: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Order für die Übersichtsseite: mit Händlername, Saison-Label und den
 * Zeilen-Beträgen zum Aufsummieren.
 */
export interface OrderListRow extends Order {
  dealer: { name: string } | null
  season: { label: string } | null
  order_items: { quantity: number; unit_price: number | string | null }[]
}

/** Felder zum Anlegen einer neuen Order (Kopfdaten optional). */
export interface OrderInput extends OrderHeadFields {
  dealer_id: string
  season_id: string
  assignment: OrderAssignment
  notes: string | null
}

/** Summe einer Zeile (Menge × Einzelpreis), robust gegen numeric-Strings. */
export function lineTotal(
  quantity: number,
  unit_price: number | string | null,
): number {
  const price =
    unit_price === null || unit_price === ''
      ? 0
      : typeof unit_price === 'string'
        ? Number(unit_price)
        : unit_price
  if (Number.isNaN(price)) return 0
  return quantity * price
}
