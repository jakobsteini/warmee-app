import { supabase } from './supabase'
import {
  rankByDistance,
  withinRadius,
  normCountry,
  type LatLng,
  type GeoItem,
} from './geoDistance'

// ============================================================================
// Umkreissuche Händler (reine Lese-Funktion). Ursprung (PLZ/Ort) → Koordinate
// aus plz_coordinates (globale Referenz), Händler der eigenen Org (RLS) über ihre
// PLZ verorten, Entfernung im supabase-freien Kern rechnen. Händler ohne
// brauchbare PLZ / außerhalb des Verzeichnisses werden NICHT weggeworfen, sondern
// getrennt als „ohne Koordinate" zurückgegeben.
// ============================================================================

/** Ein Händler in der Trefferliste (nur die für die Liste nötigen Felder). */
export interface NearbyDealer {
  id: string
  name: string
  city: string | null
  plz: string | null
  crmNote: string | null
}

/** Grund, warum ein Händler keine Entfernung hat. */
export type NoCoordReason = 'noZip' | 'notFound'

export interface NearbySearchResult {
  /** Aufgelöster Ursprung, oder null wenn PLZ/Ort nicht gefunden. */
  origin: { place: string; plz: string; country: string } | null
  /** Treffer im Radius, aufsteigend nach km. */
  within: { dealer: NearbyDealer; distanceKm: number }[]
  /** Händler ohne verortbare Adresse (sichtbar ausweisen, nicht verschlucken). */
  noCoord: { dealer: NearbyDealer; reason: NoCoordReason }[]
}

/** PLZ store→shipping→billing (die Ladenadresse zuerst). */
function dealerPlz(d: DealerRow): string | null {
  const raw = d.store_zip ?? d.shipping_zip ?? d.billing_zip
  const t = (raw ?? '').trim()
  return t === '' ? null : t
}

/** Land passend zur gewählten PLZ-Quelle (gleiche Reihenfolge). */
function dealerCountryRaw(d: DealerRow): string | null {
  if ((d.store_zip ?? '').trim() !== '') return d.store_country_code ?? d.country
  if ((d.shipping_zip ?? '').trim() !== '') return d.shipping_country_code ?? d.country
  if ((d.billing_zip ?? '').trim() !== '') return d.billing_country_code ?? d.country
  return d.country
}

interface DealerRow {
  id: string
  name: string
  city: string | null
  country: string | null
  crm_notiz: string | null
  store_zip: string | null
  shipping_zip: string | null
  billing_zip: string | null
  store_city: string | null
  shipping_city: string | null
  billing_city: string | null
  store_country_code: string | null
  shipping_country_code: string | null
  billing_country_code: string | null
}

interface PlzRow {
  country_code: string
  plz: string
  place: string | null
  lat: number
  lng: number
}

/** Schlüssel (Land, PLZ) für die Koordinaten-Zuordnung. */
function geoKey(country: string, plz: string): string {
  return `${country}\t${plz}`
}

/**
 * Ursprung auflösen: reine PLZ (4–5 Ziffern) → exakte PLZ (AT vor CH bei
 * 4-stelliger Mehrdeutigkeit), sonst Ort → Ortsname-Suche. null, wenn nichts passt.
 */
async function geocodeOrigin(
  query: string,
): Promise<{ coord: LatLng; place: string; plz: string; country: string } | null> {
  const q = query.trim()
  if (q === '') return null

  if (/^\d{4,5}$/.test(q)) {
    const { data } = await supabase
      .from('plz_coordinates')
      .select('country_code, plz, place, lat, lng')
      .eq('plz', q)
    const rows = (data ?? []) as PlzRow[]
    if (rows.length === 0) return null
    // Bei Mehrdeutigkeit (4-stellig AT/CH) AT bevorzugen, dann CH, dann DE.
    const pref = ['AT', 'CH', 'DE']
    rows.sort((a, b) => pref.indexOf(a.country_code) - pref.indexOf(b.country_code))
    const r = rows[0]
    return { coord: { lat: r.lat, lng: r.lng }, place: r.place ?? q, plz: r.plz, country: r.country_code }
  }

  // Ort: Präfix-Treffer bevorzugt, sonst enthält.
  let { data } = await supabase
    .from('plz_coordinates')
    .select('country_code, plz, place, lat, lng')
    .ilike('place', `${q}%`)
    .limit(1)
  let rows = (data ?? []) as PlzRow[]
  if (rows.length === 0) {
    const res = await supabase
      .from('plz_coordinates')
      .select('country_code, plz, place, lat, lng')
      .ilike('place', `%${q}%`)
      .limit(1)
    rows = (res.data ?? []) as PlzRow[]
  }
  if (rows.length === 0) return null
  const r = rows[0]
  return { coord: { lat: r.lat, lng: r.lng }, place: r.place ?? q, plz: r.plz, country: r.country_code }
}

function toNearby(d: DealerRow): NearbyDealer {
  return {
    id: d.id,
    name: d.name,
    city: d.store_city ?? d.shipping_city ?? d.billing_city ?? d.city,
    plz: dealerPlz(d),
    crmNote: d.crm_notiz,
  }
}

/**
 * Händler im Umkreis suchen. `query` = PLZ oder Ort, `radiusKm` = Radius.
 * Read-only; RLS scoped die Händler auf die eigene Org (Multi-Mandant ohne
 * Hardcoding). Händler ohne PLZ → reason 'noZip'; PLZ nicht im Verzeichnis
 * (z. B. Italien/USA) → reason 'notFound'. Beide werden sichtbar zurückgegeben.
 */
export async function searchDealersNearby(
  query: string,
  radiusKm: number,
): Promise<NearbySearchResult> {
  const origin = await geocodeOrigin(query)
  if (!origin) return { origin: null, within: [], noCoord: [] }

  const { data: dealerRaw, error } = await supabase
    .from('dealers')
    .select(
      'id, name, city, country, crm_notiz, store_zip, shipping_zip, billing_zip, store_city, shipping_city, billing_city, store_country_code, shipping_country_code, billing_country_code',
    )
  if (error) throw error
  const dealers = (dealerRaw ?? []) as DealerRow[]

  // Verortbare Händler: (normalisiertes Land, PLZ) sammeln.
  const withGeo: { dealer: DealerRow; country: string; plz: string }[] = []
  const noCoord: { dealer: NearbyDealer; reason: NoCoordReason }[] = []
  for (const d of dealers) {
    const plz = dealerPlz(d)
    if (!plz) {
      noCoord.push({ dealer: toNearby(d), reason: 'noZip' })
      continue
    }
    const country = normCountry(dealerCountryRaw(d))
    if (!country) {
      noCoord.push({ dealer: toNearby(d), reason: 'notFound' })
      continue
    }
    withGeo.push({ dealer: d, country, plz })
  }

  // Koordinaten der Händler-PLZ gebündelt laden.
  const plzList = [...new Set(withGeo.map((g) => g.plz))]
  const coordByKey = new Map<string, LatLng>()
  if (plzList.length > 0) {
    const { data: plzRaw } = await supabase
      .from('plz_coordinates')
      .select('country_code, plz, lat, lng')
      .in('plz', plzList)
    for (const p of (plzRaw ?? []) as PlzRow[]) {
      coordByKey.set(geoKey(p.country_code, p.plz), { lat: p.lat, lng: p.lng })
    }
  }

  const geoItems: GeoItem<NearbyDealer>[] = []
  for (const g of withGeo) {
    const coord = coordByKey.get(geoKey(g.country, g.plz))
    if (!coord) {
      noCoord.push({ dealer: toNearby(g.dealer), reason: 'notFound' })
      continue
    }
    geoItems.push({ item: toNearby(g.dealer), coord })
  }

  const ranked = rankByDistance(origin.coord, geoItems)
  const within = withinRadius(ranked, radiusKm).map((r) => ({
    dealer: r.item,
    distanceKm: r.distanceKm as number,
  }))

  // Stabil sortieren: keine-PLZ zuerst, dann PLZ-nicht-gefunden; je Gruppe nach Name.
  noCoord.sort(
    (a, b) =>
      (a.reason === b.reason ? 0 : a.reason === 'noZip' ? -1 : 1) ||
      a.dealer.name.localeCompare(b.dealer.name),
  )

  return {
    origin: { place: origin.place, plz: origin.plz, country: origin.country },
    within,
    noCoord,
  }
}
