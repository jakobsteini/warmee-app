/**
 * Eine konfigurierbare Mahnstufe (dunning_levels). fee kann als number oder
 * String aus der DB kommen (numeric). Anzahl, Bezeichnung, Tage-Abstand und
 * Gebühr sind editierbar — nichts davon steht hart im Code.
 */
export interface DunningLevel {
  id: string
  org_id: string
  /** Reihenfolge/Nummer (1, 2, 3 …), eindeutig je Org. */
  level_number: number
  label: string
  /** Ab wie vielen Tagen NACH Fälligkeit die Stufe greift. */
  days_after_due: number
  fee: number | string
  /** Löst diese Stufe Inkasso aus? */
  triggers_collection: boolean
  created_at: string | null
  updated_at: string | null
}

/** Eingaben zum Anlegen/Ändern einer Mahnstufe (ohne org_id/id). */
export interface DunningLevelInput {
  level_number: number
  label: string
  days_after_due: number
  fee: number
  triggers_collection: boolean
}

/** Zustand eines Inkasso-Falls. */
export type CollectionStatus = 'active' | 'withdrawn'

/**
 * Ein Inkasso-Fall (dunning_collections) als eingefrorener Snapshot. Übergabe
 * legt eine Zeile mit status='active' an; die Rücknahme setzt sie auf
 * 'withdrawn' + Grund. numeric-Felder können als number oder String ankommen.
 */
export interface DunningCollection {
  id: string
  org_id: string
  invoice_id: string
  dealer_id: string
  /** Offener Betrag zum Übergabezeitpunkt (eingefroren). */
  open_amount_snapshot: number | string
  /** Erreichte Mahnstufe zum Übergabezeitpunkt (eingefroren). */
  level_number_snapshot: number
  /** Bezeichnung der Stufe zum Übergabezeitpunkt (eingefroren). */
  label_snapshot: string
  handed_over_at: string
  handed_over_by: string | null
  status: CollectionStatus
  withdrawn_at: string | null
  withdrawn_by: string | null
  withdrawal_reason: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Eine überfällige Rechnung mit erreichter Mahnstufe für die Übersicht.
 * Überfälligkeit/Fälligkeit stammen aus der gemeinsamen dueDates-Logik.
 */
export interface OverdueInvoiceRow {
  id: string
  invoice_number: string
  dealer_id: string
  dealer_name: string | null
  total: number | string
  /** Offener Betrag (total − paid_amount). */
  open_amount: number
  /** Fälligkeitsdatum (ISO) laut gemeinsamer Logik. */
  faellig_iso: string | null
  days_overdue: number
  /** Höchste erreichte Stufe (nach Tagen überfällig), oder null wenn noch keine. */
  level: DunningLevel | null
  /** Aktiver Inkasso-Fall zu dieser Rechnung, sonst null. */
  collection: DunningCollection | null
}
