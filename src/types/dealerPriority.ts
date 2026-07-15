/**
 * Priorität eines Händlers PRO SAISON (eigene Tabelle dealer_season_priority).
 * Wird später für die Warenverteilung gebraucht, wenn nicht alle Orders
 * vollständig beliefert werden können. priority: kleiner = höher (1 vor 2 …).
 * Genau eine Priorität je (dealer_id, season_id).
 */
export interface DealerSeasonPriority {
  id: string
  org_id: string
  dealer_id: string
  season_id: string
  priority: number
  created_at: string | null
  updated_at: string | null
}
