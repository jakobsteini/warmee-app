import { supabase } from './supabase'
import { getMyOrgId } from './org'
import { createEmailNotification } from './notifications'
import { buildDealerImagesZip } from './dealerImageZip'
import { postMail } from './mailWebhook'
import { kundentypFromAssignments } from './mailPayload'
import {
  dealerImageMailSubject,
  dealerImageMailBodyHtml,
} from './dealerImageMailPayload'
import type { BelegLang } from './belegMailPayload'
import type { AssetWithMeta } from '../types/asset'

// ============================================================================
// Händler-Bildversand (Teil B). Nutzt den zentralen n8n-Webhook wie der
// Belegversand — hier aber OHNE Anhang: die Bilder werden als EINE ZIP in einen
// privaten Bucket geladen und per zeitlich begrenzter Signed-URL VERLINKT
// (bild_link). Nur bei erfolgreichem Versand wird protokolliert (sent_at).
// ============================================================================

/** Privater Bucket für die versendeten Händler-ZIPs (org-scoped Pfad). */
const ZIP_BUCKET = 'dealer-image-zips'
/** Gültigkeit des Download-Links (7 Tage). */
const LINK_TTL_DAYS = 7
const LINK_TTL_SECONDS = LINK_TTL_DAYS * 24 * 60 * 60

/** Sprache des Händlers → Belegsprache (nur 'en' schaltet um, sonst 'de'). */
export function dealerLang(language: string | null | undefined): BelegLang {
  return language === 'en' ? 'en' : 'de'
}

export interface DealerImageMailResult {
  /** Anzahl der tatsächlich verpackten Bilder. */
  zipped: number
  /** Anzahl übersprungener (nicht ladbarer) Bilder. */
  skipped: number
}

/**
 * Bildmaterial eines Händlers per E-Mail versenden:
 *  1) die (bereits mit Signed-URLs geladenen) Bilder zu EINER ZIP packen,
 *  2) die ZIP in den privaten Bucket laden (Pfad org_id/dealer_id/…),
 *  3) eine 7-Tage-Signed-URL erzeugen,
 *  4) die Edge Function mit Betreff + Body (Link, KEIN Anhang) aufrufen,
 *  5) NUR bei Erfolg den Versand protokollieren (channel='email', sent_at).
 *
 * Wirft mit sichtbarer Meldung bei jedem Fehlschritt. Leere Bildliste →
 * verständlicher Fehler statt leerer Mail (blocken statt raten).
 */
export async function sendDealerImagesMail(params: {
  dealerId: string
  dealerName: string
  language: string | null | undefined
  images: AssetWithMeta[]
  to: string
}): Promise<DealerImageMailResult> {
  const { dealerId, dealerName, images, to } = params
  const lang = dealerLang(params.language)

  if (images.length === 0) {
    throw new Error('Für diesen Händler gibt es keine Bilder zum Versenden.')
  }

  // 1) ZIP bauen.
  const { blob, zipped, skipped } = await buildDealerImagesZip(images)
  if (!blob || zipped === 0) {
    throw new Error('Die Bilder konnten nicht geladen werden — nichts zu senden.')
  }

  // 2) In den privaten Bucket laden (org-scoped Pfad → Storage-RLS greift).
  const org_id = await getMyOrgId()
  const path = `${org_id}/${dealerId}/${crypto.randomUUID()}.zip`
  const { error: uploadError } = await supabase.storage
    .from(ZIP_BUCKET)
    .upload(path, blob, { contentType: 'application/zip', upsert: false })
  if (uploadError) {
    throw new Error('Die ZIP konnte nicht abgelegt werden (Bucket vorhanden?).')
  }

  // 3) Signed-URL (funktioniert ohne Login beim Händler, läuft nach TTL ab).
  const { data: signed, error: signError } = await supabase.storage
    .from(ZIP_BUCKET)
    .createSignedUrl(path, LINK_TTL_SECONDS)
  if (signError || !signed?.signedUrl) {
    throw new Error('Der Download-Link konnte nicht erzeugt werden.')
  }

  // 4) kundentyp: hat der Händler IRGENDEINE Order mit assignment='agent', geht
  // CC an Ilka (Regel zentral in agentGetsCommission). CC ist reine Info → im
  // Zweifel einschließen; leere/interne Orderlage → 'internal'.
  const { data: orderRows } = await supabase
    .from('orders')
    .select('assignment')
    .eq('dealer_id', dealerId)
  const kundentyp = kundentypFromAssignments(
    (orderRows ?? []).map((o) => (o as { assignment: string }).assignment),
  )

  // 5) Mail (Link im Body, KEIN Anhang) über den n8n-Webhook.
  const subject = dealerImageMailSubject(lang)
  const html = dealerImageMailBodyHtml(lang, {
    dealerName,
    downloadUrl: signed.signedUrl,
    count: zipped,
    expiresDays: LINK_TTL_DAYS,
  })

  await postMail({
    beleg_typ: 'bilder',
    empfaenger_email: to.trim(),
    sprache: lang,
    kundentyp,
    betreff: subject,
    html,
    bild_link: signed.signedUrl,
  })

  // 6) Erst NACH erfolgreichem Versand protokollieren.
  await createEmailNotification({
    type: 'dealer_images_email',
    title: subject,
    body: `${to.trim()} · ${zipped} Bilder`,
    link: `/dealers/${dealerId}`,
  })

  return { zipped, skipped }
}
