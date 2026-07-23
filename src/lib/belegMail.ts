import { supabase } from './supabase'
import { getInvoice, getBelegArchiv } from './invoices'
import { createEmailNotification } from './notifications'
import { postMail } from './mailWebhook'
import {
  belegTypForDocuments,
  kundentypFromAssignments,
  type Kundentyp,
  type MailAttachment,
} from './mailPayload'
import {
  belegMailSubject,
  belegMailBodyHtml,
  attachmentFilename,
  type BelegLang,
  type BelegDocType,
} from './belegMailPayload'

// ============================================================================
// Beleg-Mailversand. Der Versand läuft über den zentralen n8n-Webhook
// (mailWebhook.postMail) — EIN Mailweg für Belege + Bilder. Hier wird der
// Kontext geladen (welche archivierten PDFs, Empfänger, kundentyp), die PDFs als
// base64 angehängt und der Payload gebaut. Nur bei Erfolg wird der Versand
// protokolliert (sent_at). Kein Eingriff in Belegzahlen/Snapshots.
// ============================================================================

/** Privater Bucket mit den archivierten Beleg-PDFs. */
const ARCHIVE_BUCKET = 'belege-archiv'

/** Blob (PDF aus dem Storage) → base64-String für den Mail-Payload. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

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
  /** Läuft über die Agentin (Ilka CC) oder intern — aus der Order-Zuteilung. */
  kundentyp: Kundentyp
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

  // kundentyp aus der Order-Zuteilung (delivery → order.assignment): enthält
  // 'agent' → Ilka bekommt CC (Regel zentral in agentGetsCommission). Freie
  // Rechnung ohne Order → keine Zuteilung ableitbar → 'internal' (kein CC).
  let assignment: string | null = null
  if (inv.delivery_id) {
    const { data: del } = await supabase
      .from('deliveries')
      .select('order:orders(assignment)')
      .eq('id', inv.delivery_id)
      .maybeSingle()
    assignment =
      (del?.order as { assignment?: string | null } | null)?.assignment ?? null
  }
  const kundentyp = kundentypFromAssignments(assignment ? [assignment] : [])

  return {
    invoiceId,
    invoiceNumber: inv.invoice_number,
    noteNumber,
    dealerName,
    recipientDefault,
    language,
    kundentyp,
    attachments,
  }
}

/**
 * Beleg-Mail versenden: die archivierten PDFs als base64 anhängen und EINE Mail
 * über den n8n-Webhook schicken. Wirft mit sichtbarer Meldung bei Fehler. Nur
 * bei Erfolg wird der Versand als E-Mail-Benachrichtigung protokolliert
 * (channel='email', sent_at).
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

  // beleg_typ aus den vorhandenen Belegen ableiten.
  const hasInvoice = ctx.attachments.some((a) => a.type === 'invoice')
  const hasNote = ctx.attachments.some((a) => a.type === 'delivery_note')
  const beleg_typ = belegTypForDocuments({ hasInvoice, hasNote })
  if (!beleg_typ) {
    throw new Error('Es sind keine archivierten Belege zum Anhängen vorhanden.')
  }

  // PDFs aus dem privaten Archiv laden (RLS greift über den Caller) und als
  // base64 anhängen.
  const anhaenge: MailAttachment[] = []
  for (const a of ctx.attachments) {
    const { data, error } = await supabase.storage
      .from(ARCHIVE_BUCKET)
      .download(a.storage_path)
    if (error || !data) {
      throw new Error(`Anhang nicht ladbar: ${a.filename}`)
    }
    anhaenge.push({
      dateiname: a.filename,
      base64: await blobToBase64(data),
      content_type: 'application/pdf',
    })
  }

  await postMail({
    beleg_typ,
    empfaenger_email: to.trim(),
    sprache: ctx.language,
    kundentyp: ctx.kundentyp,
    betreff: subject,
    html,
    anhaenge,
  })

  // Erst NACH erfolgreichem Versand protokollieren.
  await createEmailNotification({
    type: 'beleg_email',
    title: subject,
    body: `${to} · ${ctx.attachments.map((a) => a.filename).join(', ')}`,
    link: `/invoices/${ctx.invoiceId}`,
  })
}
