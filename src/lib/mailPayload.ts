/**
 * Reiner Kern für den n8n-Mailversand (supabase-frei, kein import.meta.env →
 * `node --test`-fähig): Payload-Typen und die Ableitung von `beleg_typ` sowie
 * `kundentyp`. Das eigentliche POSTen an den Webhook liegt in mailWebhook.ts
 * (env-gekoppelt, nicht hier). So bleibt die Logik testbar.
 *
 * `kundentyp` nutzt BEWUSST die bestehende zentrale Regel `agentGetsCommission`
 * (commissionCalc.ts) — dieselbe Frage wie „ist das Ilkas Händler?" wird nicht
 * zweimal implementiert.
 */

import { agentGetsCommission } from './commissionCalc.ts'

/** Belegart für die From-/CC-Weiche + Logging in n8n. */
export type BelegTyp =
  | 'rechnung'
  | 'lieferschein'
  | 'rechnung_lieferschein'
  | 'ab'
  | 'bilder'

export type MailSprache = 'de' | 'en'

/** Läuft der Vorgang über die Agentin (Ilka CC) oder intern? = assignment-Wert. */
export type Kundentyp = 'agent' | 'internal'

/** Ein base64-kodierter Anhang (Belege). */
export interface MailAttachment {
  dateiname: string
  base64: string
  content_type: string
}

interface MailBase {
  empfaenger_email: string
  sprache: MailSprache
  kundentyp: Kundentyp
  betreff: string
  html: string
}

/** Belege: Anhänge als base64 (kein bild_link). */
export interface BelegMailPayload extends MailBase {
  beleg_typ: Exclude<BelegTyp, 'bilder'>
  anhaenge: MailAttachment[]
}

/** Bilder: Download-Link (7-Tage-Signed-URL), KEIN Anhang. */
export interface BilderMailPayload extends MailBase {
  beleg_typ: 'bilder'
  bild_link: string
}

/** Genau ein Kanal ist gefüllt: anhaenge (Belege) XOR bild_link (Bilder). */
export type MailPayload = BelegMailPayload | BilderMailPayload

/**
 * beleg_typ aus den vorhandenen Belegen: Rechnung + Lieferschein →
 * 'rechnung_lieferschein', nur Rechnung → 'rechnung', nur Lieferschein →
 * 'lieferschein'. null, wenn keiner von beiden dabei ist (dann nichts zu senden).
 */
export function belegTypForDocuments(opts: {
  hasInvoice: boolean
  hasNote: boolean
}): 'rechnung' | 'lieferschein' | 'rechnung_lieferschein' | null {
  if (opts.hasInvoice && opts.hasNote) return 'rechnung_lieferschein'
  if (opts.hasInvoice) return 'rechnung'
  if (opts.hasNote) return 'lieferschein'
  return null
}

/**
 * kundentyp aus den Order-Zuteilungen: enthält die Menge 'agent' → 'agent'
 * (Ilka CC), sonst 'internal'. Reine Delegation an `agentGetsCommission` —
 * dieselbe Regel wie in der Provision. Leere Menge → 'internal'.
 *
 * CC ist reine Information (kein Geldfluss): im Zweifel einschließen (jede
 * agent-Order genügt), nie blocken.
 */
export function kundentypFromAssignments(
  assignments: Iterable<string>,
): Kundentyp {
  return agentGetsCommission(new Set(assignments)) ? 'agent' : 'internal'
}
