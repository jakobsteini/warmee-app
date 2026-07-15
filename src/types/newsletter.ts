/** Status eines Newsletters (im Schema: newsletters.status). */
export type NewsletterStatus = 'draft' | 'ready' | 'downloaded'

/** Ein Newsletter-Datensatz (snake_case wie in der DB). */
export interface Newsletter {
  id: string
  org_id: string
  title: string
  subject_line: string | null
  preheader: string | null
  body_headline: string | null
  body_text: string | null
  link_label: string | null
  link_url: string | null
  accent_color: string
  dealer_id: string
  season_id: string | null
  hero_asset_id: string | null
  status: NewsletterStatus
  downloaded_at: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

/** Ein Produktbild-Slot eines Newsletters (snake_case wie in der DB). */
export interface NewsletterProduct {
  id: string
  newsletter_id: string
  asset_id: string
  product_id: string | null
  position: number
  caption: string | null
}

/**
 * Ein für den Newsletter verwendbares Bild eines Händlers.
 *
 * Nur Assets mit einem Newsletter-Zuschnitt tauchen hier auf: deren JPEG liegt
 * im öffentlichen "crops"-Bucket und hat damit eine stabile öffentliche URL,
 * die sowohl in der Live-Vorschau als auch im heruntergeladenen HTML funktioniert.
 */
export interface DealerImage {
  asset_id: string
  filename: string
  season_id: string | null
  product_id: string | null
  /** Öffentliche URL des Newsletter-Zuschnitts (crops-Bucket, 600px breit). */
  cropUrl: string
}

/** Textfelder des Newsletters (deutsches UI, englische Spalten). */
export interface NewsletterText {
  title: string
  subject_line: string
  preheader: string
}

/** Ein Newsletter-Eintrag für die Verlaufsliste (inkl. Händlername). */
export interface NewsletterListItem {
  id: string
  title: string
  status: NewsletterStatus
  dealer_name: string | null
  updated_at: string | null
  downloaded_at: string | null
}

/**
 * Ein vollständig geladener Newsletter zum Wiederöffnen im Editor.
 * `product_asset_ids` ist nach `position` sortiert (Slot 1, dann Slot 2).
 */
export interface NewsletterDetail {
  id: string
  title: string
  subject_line: string | null
  preheader: string | null
  body_headline: string | null
  body_text: string | null
  link_label: string | null
  link_url: string | null
  accent_color: string
  dealer_id: string
  hero_asset_id: string | null
  status: NewsletterStatus
  product_asset_ids: string[]
}
