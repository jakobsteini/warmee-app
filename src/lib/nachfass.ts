import { supabase } from './supabase'
import {
  computeFollowUpDealers,
  followUpLang,
  followUpMessage,
  type SeasonRef,
  type DealerSeasonRevenue,
} from './nachfassCalc'
import { normalizePhone, waMeLink } from './phoneNormalize'

// ============================================================================
// Saison-Nachfass-Liste (reine Lese-Auswertung). Bestandskunden ohne bestätigte
// Order in der Zielsaison. Umsatz = bestätigte Orders, netto je Position
// quantity × (unit_price, ersatzweise wholesale_price) — Konvention wie
// analytics.ts. Aggregation/Chronologie im supabase-freien Kern. RLS scoped die
// Org (Multi-Mandant ohne Hardcoding).
// ============================================================================

/** Eine Zeile der Nachfass-Liste. */
export interface FollowUpRow {
  dealerId: string
  name: string
  city: string | null
  plz: string | null
  lastSeasonLabel: string
  lastRevenue: number
  crmNote: string | null
  /** Rohe Telefonnummer (Anzeige), auch wenn nicht normalisierbar. */
  phoneRaw: string | null
  email: string | null
  /** wa.me-Link mit vorbereitetem Text, oder null (dann Link ausgrauen). */
  waLink: string | null
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? 0 : n
}

interface DealerRow {
  id: string
  name: string
  language: string | null
  crm_notiz: string | null
  city: string | null
  country: string | null
  store_city: string | null
  shipping_city: string | null
  billing_city: string | null
  store_zip: string | null
  shipping_zip: string | null
  billing_zip: string | null
  store_phone: string | null
  shipping_phone: string | null
  billing_phone: string | null
  email: string | null
  store_email: string | null
  shipping_email: string | null
  billing_email: string | null
  store_country_code: string | null
  shipping_country_code: string | null
  billing_country_code: string | null
}

const first = (...vals: (string | null)[]): string | null => {
  for (const v of vals) {
    const t = (v ?? '').trim()
    if (t !== '') return t
  }
  return null
}

/**
 * Nachfass-Liste für eine Zielsaison laden. Read-only; RLS scoped die Org.
 * Händler ohne (normalisierbare) Telefonnummer bleiben in der Liste, nur ohne
 * WhatsApp-Link (kein stiller Datenverlust).
 */
export async function getFollowUpList(
  targetSeasonId: string,
): Promise<FollowUpRow[]> {
  // 1) Saisons (Chronologie + Labels).
  const { data: seasonRaw, error: sErr } = await supabase
    .from('seasons')
    .select('id, code, label, created_at')
  if (sErr) throw sErr
  const seasons: SeasonRef[] = (seasonRaw ?? []).map((s) => {
    const row = s as { id: string; code: string; label: string; created_at: string | null }
    return {
      id: row.id,
      code: row.code,
      label: row.label,
      fallbackOrder: row.created_at ? new Date(row.created_at).getTime() : 0,
    }
  })
  const targetLabel = seasons.find((s) => s.id === targetSeasonId)?.label ?? ''

  // 2) Bestätigte Orders → Netto-Umsatz je (Händler, Saison).
  const { data: ordRaw, error: oErr } = await supabase
    .from('orders')
    .select(
      'dealer_id, season_id, order_items(quantity, unit_price, product:products(wholesale_price))',
    )
    .eq('status', 'confirmed')
  if (oErr) throw oErr
  const revByKey = new Map<string, DealerSeasonRevenue>()
  for (const o of (ordRaw ?? []) as unknown as {
    dealer_id: string
    season_id: string
    order_items: {
      quantity: number
      unit_price: number | string | null
      product: { wholesale_price: number | string | null } | null
    }[]
  }[]) {
    let net = 0
    for (const it of o.order_items ?? []) {
      const price =
        it.unit_price != null && it.unit_price !== ''
          ? num(it.unit_price)
          : num(it.product?.wholesale_price)
      net += (it.quantity ?? 0) * price
    }
    const key = `${o.dealer_id}\t${o.season_id}`
    const cur = revByKey.get(key)
    if (cur) cur.revenue += net
    else revByKey.set(key, { dealerId: o.dealer_id, seasonId: o.season_id, revenue: net })
  }
  const orders = [...revByKey.values()]

  // 3) Kandidaten im Kern bestimmen.
  const candidates = computeFollowUpDealers(seasons, targetSeasonId, orders)
  if (candidates.length === 0) return []

  // 4) Händler-Kontext nachladen.
  const dealerIds = candidates.map((c) => c.dealerId)
  const { data: dealerRaw, error: dErr } = await supabase
    .from('dealers')
    .select(
      'id, name, language, crm_notiz, city, country, store_city, shipping_city, billing_city, store_zip, shipping_zip, billing_zip, store_phone, shipping_phone, billing_phone, email, store_email, shipping_email, billing_email, store_country_code, shipping_country_code, billing_country_code',
    )
    .in('id', dealerIds)
  if (dErr) throw dErr
  const dealerById = new Map(
    (dealerRaw ?? []).map((d) => [(d as DealerRow).id, d as DealerRow]),
  )

  return candidates.map((c) => {
    const d = dealerById.get(c.dealerId)
    const name = d?.name ?? '—'
    const phoneRaw = d ? first(d.store_phone, d.shipping_phone, d.billing_phone) : null
    const country = d
      ? first(d.store_country_code, d.shipping_country_code, d.billing_country_code, d.country)
      : null
    const e164 = normalizePhone(phoneRaw, country)
    const lang = followUpLang(d?.language)
    const waLink = waMeLink(
      e164,
      followUpMessage(lang, { dealerName: name, seasonLabel: targetLabel }),
    )
    return {
      dealerId: c.dealerId,
      name,
      city: d ? first(d.store_city, d.shipping_city, d.billing_city, d.city) : null,
      plz: d ? first(d.store_zip, d.shipping_zip, d.billing_zip) : null,
      lastSeasonLabel: c.lastSeasonLabel,
      lastRevenue: c.lastRevenue,
      crmNote: d?.crm_notiz ?? null,
      phoneRaw,
      email: d ? first(d.email, d.store_email, d.shipping_email, d.billing_email) : null,
      waLink,
    }
  })
}
