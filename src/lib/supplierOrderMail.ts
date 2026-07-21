/**
 * Lieferanten-Order (Nepal), Modul C — Rechenkern für die Bestellmail.
 * Supabase-frei → unter `node --test` prüfbar. Baut Empfängerliste, Betreff/Body
 * (DE/EN) und die mailto:-URL. KEIN echter SMTP — die App öffnet nur den
 * Mail-Client mit vorbefülltem Entwurf und lädt das PDF getrennt herunter (wie
 * beim Rest, DNS/warm-me.com ungeklärt).
 */
import { isValidEmail, collectSupplierEmails } from './supplierContacts.ts'

export type SupplierOrderLang = 'de' | 'en'

/** Belegsprache eines Lieferanten ableiten (null/‚en'/unbekannt → Englisch). */
export function supplierLang(language: string | null | undefined): SupplierOrderLang {
  return language === 'de' ? 'de' : 'en'
}

/**
 * Empfänger der Bestellmail: die (bis zu 3) Kontakt-Adressen plus — falls gültig —
 * die Haupt-E-Mail des Lieferanten, vorne, dedupliziert und in stabiler
 * Reihenfolge. Anders als der reine Kontakt-Sammler (collectSupplierEmails) nimmt
 * die Bestellung bewusst auch die Haupt-Adresse mit, damit die Order sicher ankommt.
 */
export function supplierOrderRecipients(producer: {
  email?: string | null
  kontakt1_email?: string | null
  kontakt2_email?: string | null
  kontakt3_email?: string | null
}): string[] {
  const out: string[] = []
  const primary = (producer.email ?? '').trim()
  if (primary !== '' && isValidEmail(primary)) out.push(primary)
  for (const e of collectSupplierEmails(producer)) {
    if (!out.includes(e)) out.push(e)
  }
  return out
}

/** Betreff + Body der Bestellmail in der Lieferantensprache. */
export function supplierOrderMailText(input: {
  orderNumber: string
  lang: SupplierOrderLang
}): { subject: string; body: string } {
  const { orderNumber, lang } = input
  if (lang === 'de') {
    return {
      subject: `WARM ME — Bestellung ${orderNumber}`,
      body:
        `Sehr geehrte Damen und Herren,\n\n` +
        `anbei unsere Bestellung ${orderNumber} (Details siehe PDF im Anhang).\n\n` +
        `Bitte bestätigen Sie den Eingang.\n\n` +
        `Mit freundlichen Grüßen\nWARM ME`,
    }
  }
  return {
    subject: `WARM ME — Order ${orderNumber}`,
    body:
      `Dear Sir or Madam,\n\n` +
      `please find our order ${orderNumber} attached (details in the PDF).\n\n` +
      `Kindly confirm receipt.\n\n` +
      `Best regards\nWARM ME`,
  }
}

/**
 * mailto:-URL aus Empfängern + Betreff + Body. Empfänger komma-getrennt (RFC 6068),
 * Betreff/Body prozent-kodiert. Ohne Empfänger bleibt der to-Teil leer (der
 * Nutzer trägt dann selbst ein) — kein Fehler.
 */
export function buildMailtoUrl(
  recipients: string[],
  subject: string,
  body: string,
): string {
  const to = recipients.join(',')
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${to}?${params}`
}
