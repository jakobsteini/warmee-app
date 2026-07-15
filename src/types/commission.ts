import type { OrderAssignment } from './order'

/**
 * Eine Provisionsabrechnung (Dokument). rate_percent und die Beträge sind beim
 * Erstellen EINGEFROREN — spätere Ratenänderungen verändern sie nicht.
 * numeric-Felder können als number oder String ankommen.
 */
export interface CommissionSettlement {
  id: string
  org_id: string
  season_id: string
  assignment: OrderAssignment
  period_from: string
  period_to: string
  rate_percent: number | string
  gross_received: number | string
  deductions: number | string
  net_base: number | string
  commission_amount: number | string
  notes: string | null
  created_by: string | null
  created_at: string | null
}

/** Abrechnung inkl. Saison-Label für die Liste. */
export interface CommissionSettlementRow extends CommissionSettlement {
  season: { label: string } | null
}

/**
 * Eine Saison-Zeile der Provisionsübersicht (jeweils agent-bezogen, denn nur
 * die Agentin ist provisionsrelevant).
 */
export interface SeasonCommission {
  season_id: string
  season_label: string
  is_active: boolean
  /** Ordervolumen der Agentin aus bestätigten Orders (Vorab-Basis). */
  advanceBase: number
  /** Tatsächlich eingegangene, eindeutig der Agentin zugeordnete Zahlungen. */
  actualBase: number
  /** Bezahlte Rechnungen, die nicht eindeutig zuordenbar waren (gemischte
   *  Zuteilung in (Händler, Saison) oder keine passende Order). */
  unattributedCount: number
  /** True, wenn mindestens eine (Händler, Saison) gemischte Zuteilung hat. */
  mixed: boolean
}

/** Ergebnis der Provisionsübersicht. */
export interface CommissionOverview {
  ratePercent: number
  seasons: SeasonCommission[]
}
