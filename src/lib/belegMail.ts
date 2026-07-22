import { supabase } from './supabase'
import { getInvoice, getBelegArchiv } from './invoices'
import { createEmailNotification } from './notifications'
import {
  belegMailSubject,
  belegMailBodyHtml,
  attachmentFilename,
  type BelegLang,
  type BelegDocType,
} from './belegMailPayload'

// ============================================================================
// Beleg-Mailversand (S10). Der eigentliche Versand läuft über die Supabase Edge
// Function `send-beleg-mail` (Resend-Key als Secret, nie im Client). Hier wird
// der Kontext geladen (welche archivierten PDFs), der Payload gebaut und die
// Function aufgerufen. Nur bei Erfolg wird der Versand protokolliert (sent_at).
// Kein Eingriff in Belegzahlen/Snapshots.
// ============================================================================

/** Ein anzuhängender, bereits archivierter Beleg. */
export interface BelegMailAttachment {
  type: BelegDocType
  belegnummer: string
  storage_path: string
  filename: string
}

/** Kontext für den Versanddialog einer Rechnung (+ zugehörigem Lieferschein). */
export interface InvoiceMailContext {
  invoiceId: string
  invoiceNumber: string
  noteNumber: string | null
  dealerName: string
  recipientDefault: string
  language: BelegLang
  attachments: BelegMailAttachment[]
}

/**
 * Kontext für den Rechnungs-Mailversand laden: die archivierten PDFs der
 * Rechnung UND — bei order-basierter Rechnung — des zugehörigen Lieferscheins.
 * Nur versendete (= archivierte) Belege liefern einen Anhang.
 */
export async function loadInvoiceMailContext(
  invoiceId: string,
): Promise<InvoiceMailContext> {
  const inv = await getInvoice(invoiceId)
  const language: BelegLang =
    (inv.dealer as { language?: string | null } | null)?.language === 'en' ? 'en' : 'de'
  const dealerName = inv.dealer?.name ?? ''
  const recipientDefault = inv.dealer?.email ?? ''

  const attachments: BelegMailAttachment[] = []

  const invArchive = await getBelegArchiv('invoice', invoiceId).catch(() => null)
  if (invArchive) {
    attachments.push({
      type: 'invoice',
      belegnummer: inv.invoice_number,
      storage_path: invArchive.storage_path,
      filename: attachmentFilename('invoice', inv.invoice_number, language),
    })
  }

  let noteNumber: string | null = null
  if (inv.delivery_id) {
    const { data: notes } = await supabase
      .from('delivery_notes')
      .select('id, note_number')
      .eq('delivery_id', inv.delivery_id)
      .neq('status', 'cancelled')
    for (const n of (notes ?? []) as { id: string; note_number: string }[]) {
      const arch = await getBelegArchiv('delivery_note', n.id).catch(() => null)
      if (arch) {
        noteNumber = n.note_number
        attachments.push({
          type: 'delivery_note',
          belegnummer: n.note_number,
          storage_path: arch.storage_path,
          filename: attachmentFilename('delivery_note', n.note_number, language),
        })
      }
    }
  }

  return {
    invoiceId,
    invoiceNumber: inv.invoice_number,
    noteNumber,
    dealerName,
    recipientDefault,
    language,
    attachments,
  }
}

/**
 * Beleg-Mail versenden: ruft die Edge Function (EINE Mail mit allen Anhängen).
 * Wirft mit sichtbarer Meldung bei Fehler. Nur bei Erfolg wird der Versand als
 * E-Mail-Benachrichtigung protokolliert (channel='email', sent_at).
 */
export async function sendInvoiceMail(
  ctx: InvoiceMailContext,
  to: string,
): Promise<void> {
  if (ctx.attachments.length === 0) {
    throw new Error('Es sind keine archivierten Belege zum Anhängen vorhanden.')
  }
  const subject = belegMailSubject(ctx.language, {
    invoiceNumber: ctx.invoiceNumber,
    noteNumber: ctx.noteNumber,
  })
  const html = belegMailBodyHtml(ctx.language, {
    dealerName: ctx.dealerName,
    invoiceNumber: ctx.invoiceNumber,
    noteNumber: ctx.noteNumber,
  })

  const { data, error } = await supabase.functions.invoke('send-beleg-mail', {
    body: {
      to: to.trim(),
      subject,
      html,
      attachments: ctx.attachments.map((a) => ({
        storage_path: a.storage_path,
        filename: a.filename,
      })),
    },
  })
  if (error) {
    throw new Error(
      'Der Versand-Dienst ist nicht erreichbar (Edge Function nicht deployt?).',
    )
  }
  if (!data?.ok) {
    throw new Error(data?.error ?? 'Der Versand ist fehlgeschlagen.')
  }

  // Erst NACH erfolgreichem Versand protokollieren.
  await createEmailNotification({
    type: 'beleg_email',
    title: subject,
    body: `${to} · ${ctx.attachments.map((a) => a.filename).join(', ')}`,
    link: `/invoices/${ctx.invoiceId}`,
  })
}
