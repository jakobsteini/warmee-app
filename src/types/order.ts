import type { TranslationKey } from '../i18n/dict'
import { parseDecimalField, parseIntField } from '../lib/paymentTerms.ts'
import { DEFAULT_ZAHLUNGSZIEL_TAGE } from '../lib/tax.ts'
import { normalizeShippingFreitext } from '../lib/shipping.ts'

/** Mögliche Order-Status (englisch gespeichert, wie in der DB-Check-Constraint). */
export const ORDER_STATUSES = ['draft', 'submitted', 'confirmed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// ─── Kopfdaten-Dropdowns (app-seitig validiert, kein DB-CHECK; erweiterbar) ───

/** Order-Art. */
export const ORDER_TYPES = ['vororder', 'prompt', 'lager'] as const
/** Versandart (erweiterbar). „sonstige" = frei anpassbar via shipping_method_freitext. */
export const SHIPPING_METHODS = ['dpd', 'dsv', 'sonstige'] as const
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
  sonstige: 'order.shipMethod.sonstige',
}
export const ORDER_TERM_LABEL_KEYS: Record<string, TranslationKey> = {
  ab_werk: 'order.terms.abWerk',
  frei_haus: 'order.terms.freiHaus',
}

/** Editierbare Kopfdaten der Order (Anlage + Bearbeitung). Alle optional. */
export interface OrderHeadFields {
  order_type: string | null
  shipping_method: string | null
  /** Freitext-Versandart, nur bei shipping_method = „sonstige" relevant (sonst null). */
  shipping_method_freitext: string | null
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
  /** Zahlungsziel in Tagen (netto). DB-Default 30. */
  zahlungsziel_tage: number
  /** Skontosatz in Prozent; null = kein Skonto. numeric(5,2) (kann als string ankommen). */
  skonto_prozent: number | string | null
  /** Skontofrist in Tagen; null = kein Skonto. */
  skonto_tage: number | null
  /** Freitext-Zahlungsbedingung für Sonderfälle; null wenn leer. */
  zahlungsbedingung_freitext: string | null
}

/** Formular-Zustand der Kopfdaten (Strings + das Prioritäts-Boolean). */
export interface OrderHeadForm {
  order_type: string
  shipping_method: string
  shipping_method_freitext: string
  shipping_terms: string
  delivery_terms: string
  delivery_date_from: string
  delivery_date_to: string
  po_number: string
  priority: boolean
  zahlungsziel_tage: string
  skonto_prozent: string
  skonto_tage: string
  zahlungsbedingung_freitext: string
}

export const emptyOrderHead: OrderHeadForm = {
  order_type: '',
  shipping_method: '',
  shipping_method_freitext: '',
  shipping_terms: '',
  delivery_terms: '',
  delivery_date_from: '',
  delivery_date_to: '',
  po_number: '',
  priority: false,
  // Zahlungsziel-Default sichtbar vorbelegt (WARM-ME-Standard 30 Tage netto).
  zahlungsziel_tage: '30',
  skonto_prozent: '',
  skonto_tage: '',
  zahlungsbedingung_freitext: '',
}

/** Bestehende Order-Kopfdaten → Formular (für die Bearbeitung). */
export function orderHeadToForm(o: OrderHeadFields): OrderHeadForm {
  return {
    order_type: o.order_type ?? '',
    shipping_method: o.shipping_method ?? '',
    shipping_method_freitext: o.shipping_method_freitext ?? '',
    shipping_terms: o.shipping_terms ?? '',
    delivery_terms: o.delivery_terms ?? '',
    delivery_date_from: o.delivery_date_from ?? '',
    delivery_date_to: o.delivery_date_to ?? '',
    po_number: o.po_number ?? '',
    priority: o.priority ?? false,
    // Bestand ohne Wert → Default 30 anzeigen (kein stiller Verlust).
    zahlungsziel_tage: o.zahlungsziel_tage != null ? String(o.zahlungsziel_tage) : '30',
    skonto_prozent:
      o.skonto_prozent != null ? String(o.skonto_prozent).replace('.', ',') : '',
    skonto_tage: o.skonto_tage != null ? String(o.skonto_tage) : '',
    zahlungsbedingung_freitext: o.zahlungsbedingung_freitext ?? '',
  }
}

/**
 * Formular → DB-Felder (leer → null; priority als Boolean). Die Zahlungsfelder
 * werden hier lenient gebaut; die harte Validierung (0–100, skonto_tage <=
 * zahlungsziel, vollständig-oder-leer) läuft VORHER in der UI über
 * `validateOrderPaymentTerms` — genau wie die Lieferzeitraum-Prüfung
 * (`orderHeadDateRangeOk`) getrennt vom Bauen sitzt. So bleibt hier kein stiller
 * Datenverlust: ungültige Eingaben erreichen diese Funktion nie.
 */
export function orderHeadFromForm(f: OrderHeadForm): OrderHeadFields {
  const orNull = (v: string) => (v.trim() === '' ? null : v.trim())

  const ziel = parseIntField(f.zahlungsziel_tage)
  const sp = parseDecimalField(f.skonto_prozent)
  const st = parseIntField(f.skonto_tage)
  const skontoAktiv =
    sp.ok && sp.value !== null && sp.value > 0 &&
    st.ok && st.value !== null && st.value > 0

  return {
    order_type: orNull(f.order_type),
    shipping_method: orNull(f.shipping_method),
    // Freitext nur bei „sonstige" behalten — bei DPD/DSV/leer auf null räumen
    // (kein widersprüchlicher Zustand). Harte „sonstige braucht Freitext"-Prüfung
    // liegt vorher in der UI (validateShipping), wie beim Lieferzeitraum.
    shipping_method_freitext: normalizeShippingFreitext(
      f.shipping_method,
      f.shipping_method_freitext,
    ),
    shipping_terms: orNull(f.shipping_terms),
    delivery_terms: orNull(f.delivery_terms),
    delivery_date_from: orNull(f.delivery_date_from),
    delivery_date_to: orNull(f.delivery_date_to),
    po_number: orNull(f.po_number),
    priority: f.priority,
    zahlungsziel_tage:
      ziel.ok && ziel.value !== null ? ziel.value : DEFAULT_ZAHLUNGSZIEL_TAGE,
    skonto_prozent: skontoAktiv ? (sp.value as number) : null,
    skonto_tage: skontoAktiv ? (st.value as number) : null,
    zahlungsbedingung_freitext: orNull(f.zahlungsbedingung_freitext),
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
