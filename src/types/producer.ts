/** Ein Produzent/Lieferant (snake_case wie in der DB). Nepal, Portugal, … */
export interface Producer {
  id: string
  org_id: string
  name: string
  /** Land, z. B. „NP" (Nepal), „PT" (Portugal). */
  country: string | null
  /** Aktiv = für neue Produktionsbestellungen/Artikel wählbar. */
  active: boolean
  /** Priorität für die spätere Priorisierungslogik (kleiner = höher). */
  priority: number | null
  /** Ansprechperson. */
  contact_person: string | null
  /** Kontaktperson (falls abweichend von der Ansprechperson). */
  contact_person_alt: string | null
  email: string | null
  /** Vollständige Adresse (Freitext, mehrzeilig). */
  address: string | null
  /** UID-Nr. (optional). */
  uid: string | null
  created_at: string | null
}

/** Felder zum Anlegen/Bearbeiten eines Lieferanten (org_id kommt aus dem Profil). */
export interface ProducerInput {
  name: string
  country: string | null
  active: boolean
  contact_person: string | null
  contact_person_alt: string | null
  email: string | null
  address: string | null
  uid: string | null
}
