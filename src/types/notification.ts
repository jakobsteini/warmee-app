/**
 * Eine In-App-Benachrichtigung (notifications). `channel`/`sent_at` sind
 * Vorrüstung für einen späteren E-Mail-Versand und aktuell ungenutzt
 * (channel immer 'in_app', sent_at null).
 */
export interface AppNotification {
  id: string
  org_id: string
  /** Frei, z. B. 'collection_handover' | 'collection_withdrawn'. */
  type: string
  title: string
  body: string | null
  /** In-App-Ziel des Vorgangs, z. B. '/dunning'. */
  link: string | null
  channel: 'in_app' | 'email'
  read_at: string | null
  sent_at: string | null
  created_at: string | null
}

/** Eingaben zum Erzeugen einer Benachrichtigung (ohne org_id/id). */
export interface NotificationInput {
  type: string
  title: string
  body?: string | null
  link?: string | null
}
