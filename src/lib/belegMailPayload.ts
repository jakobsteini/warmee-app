/**
 * Reiner Kern für den Beleg-Mailversand (supabase-frei, `node --test`-fähig):
 * E-Mail-Validierung, Betreff/Body je Kundensprache und Anhang-Dateinamen. Keine
 * Seiteneffekte — die Edge Function verschickt, dieser Kern baut nur den Inhalt.
 */

export type BelegLang = 'de' | 'en'
export type BelegDocType = 'invoice' | 'delivery_note'

/** Welche Belege die Mail begleiten (für Betreff/Body). */
export interface BelegMailRefs {
  invoiceNumber?: string | null
  noteNumber?: string | null
}

/** Einfache, robuste E-Mail-Validierung (blocken statt raten). */
export function isValidEmail(email: string): boolean {
  const e = (email ?? '').trim()
  if (e.length === 0 || e.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** Namensteil für Datei-/Betreff-Sicherheit auf [A-Za-z0-9-] reduzieren. */
function safe(s: string | null | undefined): string {
  return (s ?? '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'Beleg'
}

/** Betreff je nach vorhandenen Belegen und Kundensprache. */
export function belegMailSubject(lang: BelegLang, refs: BelegMailRefs): string {
  const inv = refs.invoiceNumber?.trim() || null
  const note = refs.noteNumber?.trim() || null
  if (lang === 'en') {
    if (inv && note) return `WARM ME – Delivery note & invoice ${inv}`
    if (inv) return `WARM ME – Invoice ${inv}`
    if (note) return `WARM ME – Delivery note ${note}`
    return 'WARM ME – Documents'
  }
  if (inv && note) return `WARM ME – Lieferschein & Rechnung ${inv}`
  if (inv) return `WARM ME – Rechnung ${inv}`
  if (note) return `WARM ME – Lieferschein ${note}`
  return 'WARM ME – Belege'
}

/** Schlichter HTML-Body je Kundensprache. */
export function belegMailBodyHtml(
  lang: BelegLang,
  data: { dealerName: string } & BelegMailRefs,
): string {
  const name = data.dealerName?.trim() || (lang === 'en' ? 'Sir or Madam' : 'Damen und Herren')
  const greeting = lang === 'en' ? `Dear ${name},` : `Sehr geehrte/r ${name},`
  const line =
    lang === 'en'
      ? 'please find the attached documents (PDF).'
      : 'im Anhang finden Sie die Belege als PDF.'
  const sign = lang === 'en' ? 'Kind regards,<br>WARM ME' : 'Mit freundlichen Grüßen,<br>WARM ME'
  return `<p>${greeting}</p><p>${line}</p><p>${sign}</p>`
}

/** Anhang-Dateiname je Belegart/Sprache: z. B. Rechnung_2026-0001.pdf. */
export function attachmentFilename(
  type: BelegDocType,
  belegnummer: string,
  lang: BelegLang,
): string {
  const label =
    type === 'invoice'
      ? lang === 'en'
        ? 'Invoice'
        : 'Rechnung'
      : lang === 'en'
        ? 'DeliveryNote'
        : 'Lieferschein'
  return `${label}_${safe(belegnummer)}.pdf`
}
