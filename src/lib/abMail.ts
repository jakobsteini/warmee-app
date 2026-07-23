import { supabase } from './supabase'
import { postMail } from './mailWebhook'
import { kundentypFromAssignments } from './mailPayload'
import { createEmailNotification } from './notifications'
import { abMailSubject, abMailBodyHtml } from './abMailPayload'
import type { BelegLang } from './belegMailPayload'

// ============================================================================
// AB-Mailversand (Auftragsbestätigung). Läuft über DENSELBEN n8n-Webhook wie
// Belege/Bilder (mailWebhook.postMail) — beleg_typ 'ab', PDF als base64. Das PDF
// kommt aus GENAU demselben Pfad wie der Download (buildOrderConfirmationData +
// buildOrderConfirmationPdf), kein zweiter Codepfad. Nur bei Erfolg wird der
// Versand-Status am Auftrag gesetzt und protokolliert. Keine Auftragszahlen/
// Snapshots werden berührt.
// ============================================================================

/** Blob (PDF) → base64 für den Mail-Payload. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Belegsprache eines Händlers → 'en' nur bei 'en', sonst 'de'. */
export function abLang(language: string | null | undefined): BelegLang {
  return language === 'en' ? 'en' : 'de'
}

/**
 * Auftragsbestätigung per Mail versenden. Wirft mit sichtbarer Meldung bei
 * jedem Fehlschritt. Nur bei erfolgreichem Versand werden orders.ab_sent_at/
 * ab_sent_to gesetzt und eine E-Mail-Benachrichtigung protokolliert.
 */
export async function sendOrderConfirmationMail(params: {
  orderId: string
  orderNumber: string
  dealerName: string
  language: string | null
  assignment: string
  to: string
}): Promise<void> {
  const { orderId, orderNumber, dealerName, assignment, to } = params
  const lang = abLang(params.language)
  const recipient = to.trim()

  // 1) AB-PDF — exakt derselbe Pfad wie der Download.
  const { buildOrderConfirmationData } = await import('./orderConfirmation')
  const data = await buildOrderConfirmationData(orderId)
  const { buildOrderConfirmationPdf } = await import('./pdf')
  const blob = buildOrderConfirmationPdf(data)
  const base64 = await blobToBase64(blob)

  // 2) kundentyp aus der Order-Zuteilung (zentrale Regel, keine zweite Logik).
  const kundentyp = kundentypFromAssignments([assignment])

  // 3) Betreff/Body aus dem supabase-freien Kern.
  const subject = abMailSubject(lang, { orderNumber })
  const html = abMailBodyHtml(lang, { dealerName, orderNumber })

  // 4) Versand über den gemeinsamen Webhook (wirft, wenn nicht ok).
  await postMail({
    beleg_typ: 'ab',
    empfaenger_email: recipient,
    sprache: lang,
    kundentyp,
    betreff: subject,
    html,
    anhaenge: [
      { dateiname: `${orderNumber}.pdf`, base64, content_type: 'application/pdf' },
    ],
  })

  // 5) Erst NACH erfolgreichem Versand: Status + Protokoll.
  const { error } = await supabase
    .from('orders')
    .update({ ab_sent_at: new Date().toISOString(), ab_sent_to: recipient })
    .eq('id', orderId)
  if (error) throw error

  await createEmailNotification({
    type: 'ab_email',
    title: subject,
    body: `${recipient} · AB ${orderNumber}`,
    link: `/orders/${orderId}`,
  })
}
