import type { MailPayload } from './mailPayload'

// ============================================================================
// Zentraler Mailversand über den n8n-Webhook (EIN Mailweg für Belege + Bilder,
// wie die AB-Mail). Der Payload geht per POST an VITE_N8N_MAIL_WEBHOOK_URL.
//
// Zum X-Webhook-Secret-Header: Der Wert kommt aus VITE_N8N_MAIL_WEBHOOK_SECRET
// und liegt damit — wie jede VITE_-Variable — offen im Browser-Bundle. Das ist
// KEIN echtes Geheimnis, nur eine schwache Hürde gegen zufällige Fremdaufrufe.
// Für die interne, auth-geschützte App bewusst akzeptiert (gleicher Stand wie
// die bestehende AB-Mail).
// ============================================================================

const WEBHOOK_URL = import.meta.env.VITE_N8N_MAIL_WEBHOOK_URL as string | undefined
const WEBHOOK_TOKEN = import.meta.env.VITE_N8N_MAIL_WEBHOOK_SECRET as
  | string
  | undefined

/**
 * Einen Mail-Payload an den n8n-Webhook senden. Wirft mit sichtbarer Meldung,
 * wenn der Webhook nicht konfiguriert, nicht erreichbar ist oder mit non-2xx
 * antwortet — der Aufrufer zeigt die Meldung und protokolliert NICHT.
 */
export async function postMail(payload: MailPayload): Promise<void> {
  if (!WEBHOOK_URL) {
    throw new Error(
      'Der Mail-Webhook ist nicht konfiguriert (VITE_N8N_MAIL_WEBHOOK_URL fehlt).',
    )
  }

  let resp: Response
  try {
    resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_TOKEN ? { 'X-Webhook-Secret': WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Der Mail-Dienst ist nicht erreichbar.')
  }

  if (!resp.ok) {
    throw new Error(`Der Versand ist fehlgeschlagen (${resp.status}).`)
  }
}
