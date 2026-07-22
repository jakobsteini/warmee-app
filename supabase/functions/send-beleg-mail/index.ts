// Supabase Edge Function: send-beleg-mail
//
// Verschickt EINE Mail mit den archivierten Beleg-PDFs (Lieferschein + Rechnung)
// als Anhang über Resend. Der Resend-API-Key liegt als Supabase-Secret
// (RESEND_API_KEY) und verlässt nie den Client.
//
// Sicherheit:
//  - Die PDFs werden mit dem JWT DES AUFRUFERS aus dem privaten Bucket
//    `belege-archiv` geladen — die Storage-RLS (erstes Pfad-Segment = org_id)
//    stellt sicher, dass nur eigene Belege angehängt werden. Kein Service-Role-Key.
//  - Antwortet immer mit 200 und { ok, error } (Fehler sichtbar, kein stiller Fail);
//    der Client wertet ok aus.
//
// Deploy (durch Jakob): siehe Abschluss-Block der Session (Secret setzen,
// supabase functions deploy send-beleg-mail).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const ARCHIVE_BUCKET = 'belege-archiv'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Attachment {
  storage_path: string
  filename: string
}
interface Payload {
  to: string
  subject: string
  html: string
  attachments: Attachment[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, error: 'Nicht angemeldet.' })

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ ok: false, error: 'RESEND_API_KEY fehlt (Secret nicht gesetzt).' })
    const from = Deno.env.get('RESEND_FROM') ?? 'WARM ME <belege@warm-me.com>'

    const payload = (await req.json()) as Payload
    const to = (payload?.to ?? '').trim()
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ ok: false, error: 'Ungültige Empfänger-Adresse.' })
    }
    const attachments = Array.isArray(payload?.attachments) ? payload.attachments : []
    if (attachments.length === 0) {
      return json({ ok: false, error: 'Keine anzuhängenden Belege gefunden.' })
    }

    // Supabase-Client mit dem JWT des Aufrufers → Storage-RLS greift (eigene Org).
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const resendAttachments: { filename: string; content: string }[] = []
    for (const a of attachments) {
      const { data, error } = await supabase.storage
        .from(ARCHIVE_BUCKET)
        .download(a.storage_path)
      if (error || !data) {
        return json({ ok: false, error: `Anhang nicht ladbar: ${a.filename}` })
      }
      const bytes = new Uint8Array(await data.arrayBuffer())
      resendAttachments.push({ filename: a.filename, content: encodeBase64(bytes) })
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: payload.subject,
        html: payload.html,
        attachments: resendAttachments,
      }),
    })

    const resendBody = await resendResp.json().catch(() => ({}))
    if (!resendResp.ok) {
      const msg = (resendBody?.message as string) ?? `Resend-Fehler (${resendResp.status}).`
      return json({ ok: false, error: msg })
    }

    return json({ ok: true, id: resendBody?.id ?? null })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Unbekannter Fehler.' })
  }
})
