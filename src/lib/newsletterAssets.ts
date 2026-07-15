import { supabase } from './supabase'

// ============================================================================
// Konstante Marken-Grafiken des Newsletters (Header-Headline, Showroom-Promo,
// Werte-Badges). Sie sind in allen WARM-ME-Vorlagen identisch und liegen als
// feste PNGs im öffentlichen Bucket "newsletter-assets" (einmalig rehostet).
// ============================================================================

const BUCKET = 'newsletter-assets'

/** Dateinamen im Bucket. Beim Rehosten exakt so benennen (Upload-Anleitung). */
export const NEWSLETTER_ASSET_FILES = {
  header: 'header-coziest-news.png',
  showroom: 'promo-showroom.png',
  appointment: 'promo-book-appointment.png',
  badgeMindful: 'badge-mindful-luxury.png',
  badgeCashmere: 'badge-finest-cashmere.png',
  badgeNepal: 'badge-handmade-nepal.png',
} as const

export type NewsletterAssetKey = keyof typeof NEWSLETTER_ASSET_FILES
export type NewsletterAssetUrls = Record<NewsletterAssetKey, string>

/**
 * Öffentliche URLs der Marken-Grafiken (Bucket ist public). Werden sowohl in
 * der Live-Vorschau als auch in das heruntergeladene HTML eingebettet, damit
 * die Datei eigenständig überall rendert.
 */
export function newsletterAssetUrls(): NewsletterAssetUrls {
  const out = {} as NewsletterAssetUrls
  for (const key of Object.keys(NEWSLETTER_ASSET_FILES) as NewsletterAssetKey[]) {
    out[key] = supabase.storage
      .from(BUCKET)
      .getPublicUrl(NEWSLETTER_ASSET_FILES[key]).data.publicUrl
  }
  return out
}
