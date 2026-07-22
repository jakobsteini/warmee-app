/**
 * Reiner Kern für den Händler-Bildversand (supabase-frei, `node --test`-fähig):
 * Betreff und HTML-Body je Kundensprache mit Download-Link. Keine Seiteneffekte —
 * die Edge Function verschickt, dieser Kern baut nur den Inhalt. E-Mail-Validierung
 * kommt aus belegMailPayload (`isValidEmail`), nicht doppelt definiert.
 */

import type { BelegLang } from './belegMailPayload'

/** HTML-escape für in den Body eingesetzte Freitexte (Name, Link). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Betreff je Kundensprache. */
export function dealerImageMailSubject(lang: BelegLang): string {
  return lang === 'en' ? 'WARM ME – Your image material' : 'WARM ME – Ihr Bildmaterial'
}

/**
 * HTML-Body mit Download-Link. Nennt die Anzahl Bilder und die Gültigkeit des
 * Links (Tage), damit der Händler weiß, dass der Link abläuft.
 */
export function dealerImageMailBodyHtml(
  lang: BelegLang,
  data: { dealerName: string; downloadUrl: string; count: number; expiresDays: number },
): string {
  const name = data.dealerName?.trim()
  const url = esc(data.downloadUrl)
  if (lang === 'en') {
    const greeting = name ? `Dear ${esc(name)},` : 'Dear Sir or Madam,'
    return (
      `<p>${greeting}</p>` +
      `<p>please find the image material for your ordered articles (${data.count} images) here:</p>` +
      `<p><a href="${url}">Download images (ZIP)</a></p>` +
      `<p>The link is valid for ${data.expiresDays} days.</p>` +
      `<p>Kind regards,<br>WARM ME</p>`
    )
  }
  const greeting = name ? `Sehr geehrte/r ${esc(name)},` : 'Sehr geehrte Damen und Herren,'
  return (
    `<p>${greeting}</p>` +
    `<p>anbei das Bildmaterial zu Ihren bestellten Artikeln (${data.count} Bilder):</p>` +
    `<p><a href="${url}">Bilder herunterladen (ZIP)</a></p>` +
    `<p>Der Link ist ${data.expiresDays} Tage gültig.</p>` +
    `<p>Mit freundlichen Grüßen,<br>WARM ME</p>`
  )
}
