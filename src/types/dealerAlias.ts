/**
 * Alias-Namen je Händler (eigene Tabelle dealer_aliases). Alternative
 * Schreibweisen/Bezeichnungen eines Händlers, damit die Freitextsuche in der
 * Händlerliste sie mitfindet. Ein Händler kann mehrere Aliasse haben.
 */

/** Ein dealer_aliases-Datensatz (snake_case wie in der DB). */
export interface DealerAlias {
  id: string
  org_id: string
  dealer_id: string
  alias: string
  created_at: string | null
}
