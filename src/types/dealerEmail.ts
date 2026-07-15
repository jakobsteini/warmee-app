/**
 * E-Mail-Adressen je Händler mit Zuständigkeit (eigene Tabelle dealer_emails).
 * Rollen sind englisch/snake_case in der DB; die UI-Labels laufen über i18n.
 * Ein Händler kann pro Rolle mehrere Adressen haben, eine Adresse kann mehreren
 * Rollen zugeordnet sein (je eine Zeile pro Kombination).
 */
export type DealerEmailRole = 'order_confirmation' | 'invoice' | 'delivery'

/** Reihenfolge der Rollen für die Anzeige. */
export const DEALER_EMAIL_ROLES: DealerEmailRole[] = [
  'order_confirmation',
  'invoice',
  'delivery',
]

/** Ein dealer_emails-Datensatz (snake_case wie in der DB). */
export interface DealerEmail {
  id: string
  org_id: string
  dealer_id: string
  email: string
  role: DealerEmailRole
  created_at: string | null
}

/** Felder zum Anlegen einer Zuordnung (org_id/dealer_id kommen separat). */
export interface DealerEmailInput {
  email: string
  role: DealerEmailRole
}
