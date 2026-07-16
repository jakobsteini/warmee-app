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
  /** Tatsächlich eingegangene, der Agentin zugeordnete Zahlungen. Bei
   *  gemischter Zuteilung (agent + internal in Händler/Saison) bekommt die
   *  Agentin die Provision. */
  actualBase: number
  /** Agent-berechtigte recorded Retouren dieser Saison (brutto), die die
   *  Bemessungsgrundlage mindern. Die Netto-Basis = actualBase − deductions. */
  deductions: number
  /** Bezahlte Rechnungen ohne passende bestätigte Order in (Händler, Saison):
   *  ohne Order gibt es keine Zuteilung, deshalb nicht provisionsberechenbar.
   *  Datenlage-Hinweis, kein Fehler. */
  paymentsWithoutOrder: number
}

/** Ergebnis der Provisionsübersicht. */
export interface CommissionOverview {
  ratePercent: number
  seasons: SeasonCommission[]
}
