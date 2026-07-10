/** Ein Händler-Datensatz, wie ihn Supabase liefert (snake_case). */
export interface Dealer {
  id: string
  org_id: string
  name: string
  contact_name: string | null
  email: string | null
  city: string | null
  country: string | null
  agent_id: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Felder zum Anlegen/Bearbeiten eines Händlers.
 * `name` ist Pflicht; org_id/agent_id/Zeitstempel werden nicht vom Formular
 * gesetzt (org_id kommt aus dem Profil, agent_id folgt in Baustein A).
 */
export interface DealerInput {
  name: string
  contact_name: string | null
  email: string | null
  city: string | null
  country: string | null
}
