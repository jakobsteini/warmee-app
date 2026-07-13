/** Ein Produzent (snake_case wie in der DB). Nepal, Portugal, … */
export interface Producer {
  id: string
  org_id: string
  name: string
  /** Land, z. B. „NP" (Nepal), „PT" (Portugal). */
  country: string | null
  /** Aktiv = für neue Produktionsbestellungen wählbar. */
  active: boolean
  /** Priorität für die spätere Priorisierungslogik (kleiner = höher). */
  priority: number | null
  created_at: string | null
}

/** Felder zum Anlegen/Bearbeiten eines Produzenten (org_id kommt aus dem Profil). */
export interface ProducerInput {
  name: string
  country: string | null
  active: boolean
  priority: number | null
}
