/**
 * Reiner Kern für den AB-Mailversand (supabase-frei, `node --test`): Betreff und
 * HTML-Body je Kundensprache. Keine Seiteneffekte — der Webhook verschickt, dieser
 * Kern baut nur den Inhalt. E-Mail-Validierung kommt aus belegMailPayload
 * (`isValidEmail`), nicht doppelt definiert. Analog belegMailPayload.ts.
 */

import type { BelegLang } from './belegMailPayload'

/** HTML-escape für in den Body eingesetzte Freitexte (Name, Nummer). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Betreff der AB-Mail je Kundensprache. */
export function abMailSubject(
  lang: BelegLang,
  data: { orderNumber: string },
): string {
  const nr = data.orderNumber.trim()
  return lang === 'en'
    ? `WARM ME – Order confirmation ${nr}`
    : `WARM ME – Auftragsbestätigung ${nr}`
}

/** Schlichter HTML-Body je Kundensprache (Händlername + Auftragsnummer). */
export function abMailBodyHtml(
  lang: BelegLang,
  data: { dealerName: string; orderNumber: string },
): string {
  const name = data.dealerName?.trim()
  const nr = esc(data.orderNumber.trim())
  if (lang === 'en') {
    const greeting = name ? `Dear ${esc(name)},` : 'Dear Sir or Madam,'
    return (
      `<p>${greeting}</p>` +
      `<p>please find your order confirmation ${nr} attached (PDF).</p>` +
      `<p>Kind regards,<br>WARM ME</p>`
    )
  }
  const greeting = name ? `Sehr geehrte/r ${esc(name)},` : 'Sehr geehrte Damen und Herren,'
  return (
    `<p>${greeting}</p>` +
    `<p>im Anhang finden Sie Ihre Auftragsbestätigung ${nr} als PDF.</p>` +
    `<p>Mit freundlichen Grüßen,<br>WARM ME</p>`
  )
}
