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

/**
 * Eine überfällige Rechnung mit erreichter Mahnstufe für die Übersicht.
 * Überfälligkeit/Fälligkeit stammen aus der gemeinsamen dueDates-Logik.
 */
export interface OverdueInvoiceRow {
  id: string
  invoice_number: string
  dealer_name: string | null
  total: number | string
  /** Fälligkeitsdatum (ISO) laut gemeinsamer Logik. */
  faellig_iso: string | null
  days_overdue: number
  /** Höchste erreichte Stufe (nach Tagen überfällig), oder null wenn noch keine. */
  level: DunningLevel | null
}
