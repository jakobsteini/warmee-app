/**
 * Einmal-Skript: Haendler-Adressen zu Koordinaten (dealers.lat/lng) aufloesen.
 *
 * NIE automatisch im Betrieb — ausschliesslich manuell hier. Quelle: Nominatim /
 * OpenStreetMap (kostenlos, kein API-Key). Nutzungsbedingungen eingehalten:
 *   - hoechstens 1 Request pro Sekunde (siehe SLEEP_MS),
 *   - aussagekraeftiger User-Agent mit Kontakt (siehe USER_AGENT),
 *   - Ergebnis mit Quelle 'nominatim' markiert (dealers.geocode_source).
 * Attribution „© OpenStreetMap-Mitwirkende" steht in der App-UI (DealersNearby).
 *
 * ARBEITSMODUS: Dry-Run ist Default — es wird NICHTS geschrieben, nur abgefragt
 * und ein Report ausgegeben. Scharf schreiben nur mit GEOCODE_APPLY=1.
 * IDEMPOTENT: Haendler mit bereits gesetzten lat/lng werden uebersprungen.
 * KEIN RATEN: liefert Nominatim keinen eindeutigen Treffer, bleibt lat/lng leer
 * und der Haendler landet im Report unter „nicht aufloesbar".
 *
 *   Dry-Run:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/geocodeDealers.ts
 *   Schreiben: GEOCODE_APPLY=1 SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/geocodeDealers.ts
 *
 * Optional: GEOCODE_ORG_ID=<uuid> begrenzt auf eine Organisation.
 */

// ─── Konfiguration ───────────────────────────────────────────────────────────

const DRY_RUN = process.env.GEOCODE_APPLY !== '1'
const ORG_ID = process.env.GEOCODE_ORG_ID ?? null

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
/** Nominatim verlangt einen identifizierenden User-Agent mit Kontakt. */
const USER_AGENT =
  'warmme-app dealer geocoder (one-off; contact: jakob.steinbacher@hotmail.com)'
/** >= 1000 ms: Nominatim erlaubt hoechstens 1 Anfrage pro Sekunde. */
const SLEEP_MS = 1100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Datentypen ──────────────────────────────────────────────────────────────

interface DealerRow {
  id: string
  name: string
  lat: number | string | null
  lng: number | string | null
  store_street: string | null
  store_zip: string | null
  store_city: string | null
  store_country_code: string | null
  shipping_street: string | null
  shipping_zip: string | null
  shipping_city: string | null
  shipping_country_code: string | null
  billing_street: string | null
  billing_zip: string | null
  billing_city: string | null
  billing_country_code: string | null
}

interface Address {
  street: string | null
  zip: string | null
  city: string | null
  /** ISO-alpha-2 (klein) fuer Nominatim `countrycodes`, oder null. */
  cc: string | null
}

// ─── Adress-Auswahl (store → shipping → billing, wie in der Umkreissuche) ─────

function trim(v: string | null): string | null {
  const s = (v ?? '').trim()
  return s === '' ? null : s
}

function pickAddress(d: DealerRow): Address | null {
  const sources: Address[] = [
    {
      street: trim(d.store_street),
      zip: trim(d.store_zip),
      city: trim(d.store_city),
      cc: iso2(d.store_country_code),
    },
    {
      street: trim(d.shipping_street),
      zip: trim(d.shipping_zip),
      city: trim(d.shipping_city),
      cc: iso2(d.shipping_country_code),
    },
    {
      street: trim(d.billing_street),
      zip: trim(d.billing_zip),
      city: trim(d.billing_city),
      cc: iso2(d.billing_country_code),
    },
  ]
  // Erste Quelle, die genug fuer eine sinnvolle Suche hat: Ort ODER PLZ.
  for (const a of sources) {
    if (a.city || a.zip) return a
  }
  return null
}

/** 2-Buchstaben-ISO klein fuer Nominatim, sonst null (kein Raten). */
function iso2(raw: string | null): string | null {
  const s = (raw ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(s) ? s.toLowerCase() : null
}

// ─── Nominatim ───────────────────────────────────────────────────────────────

interface GeoHit {
  lat: number
  lng: number
}

/** Strukturierte Nominatim-Suche. null = kein eindeutiger Treffer. */
async function geocode(a: Address): Promise<GeoHit | null> {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1' })
  if (a.street) params.set('street', a.street)
  if (a.city) params.set('city', a.city)
  if (a.zip) params.set('postalcode', a.zip)
  if (a.cc) params.set('countrycodes', a.cc)

  const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de' },
  })
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`)
  }
  const data = (await res.json()) as { lat: string; lon: string }[]
  if (!Array.isArray(data) || data.length === 0) return null
  const lat = Number(data[0].lat)
  const lng = Number(data[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function addrLabel(a: Address): string {
  return [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.cc?.toUpperCase()]
    .filter(Boolean)
    .join(', ')
}

// ─── Hauptlauf ───────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      'Fehlt: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY (Service-Role, nur lokal).',
    )
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, serviceKey)

  let query = supabase
    .from('dealers')
    .select(
      'id, name, lat, lng, store_street, store_zip, store_city, store_country_code, shipping_street, shipping_zip, shipping_city, shipping_country_code, billing_street, billing_zip, billing_city, billing_country_code',
    )
    .order('name')
  if (ORG_ID) query = query.eq('org_id', ORG_ID)

  const { data, error } = await query
  if (error) {
    console.error('Laden der Haendler fehlgeschlagen:', error.message)
    process.exit(1)
  }
  const dealers = (data ?? []) as DealerRow[]

  console.log(
    `\nGeocoding Haendler — Modus: ${DRY_RUN ? 'DRY-RUN (schreibt nichts)' : 'APPLY (schreibt lat/lng)'}`,
  )
  console.log(`Haendler gesamt: ${dealers.length}\n`)

  let skipped = 0
  let ok = 0
  const noAddress: string[] = []
  const notFound: string[] = []
  const failed: string[] = []

  for (const d of dealers) {
    // Idempotent: bereits geokodierte ueberspringen.
    if (d.lat !== null && d.lng !== null) {
      skipped++
      continue
    }
    const addr = pickAddress(d)
    if (!addr) {
      noAddress.push(d.name)
      continue
    }

    let hit: GeoHit | null = null
    try {
      hit = await geocode(addr)
    } catch (e) {
      failed.push(`${d.name} — ${addrLabel(addr)} — ${(e as Error).message}`)
      await sleep(SLEEP_MS)
      continue
    }

    if (!hit) {
      notFound.push(`${d.name} — ${addrLabel(addr)}`)
      await sleep(SLEEP_MS)
      continue
    }

    if (DRY_RUN) {
      console.log(`  OK  ${d.name} → ${hit.lat}, ${hit.lng}  (${addrLabel(addr)})`)
      ok++
    } else {
      const { error: upErr } = await supabase
        .from('dealers')
        .update({
          lat: hit.lat,
          lng: hit.lng,
          geocoded_at: new Date().toISOString(),
          geocode_source: 'nominatim',
        })
        .eq('id', d.id)
      if (upErr) {
        failed.push(`${d.name} — Update fehlgeschlagen: ${upErr.message}`)
      } else {
        console.log(`  OK  ${d.name} → ${hit.lat}, ${hit.lng}`)
        ok++
      }
    }
    await sleep(SLEEP_MS)
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  console.log('\n──────── Report ────────')
  console.log(`Bereits geokodiert (uebersprungen): ${skipped}`)
  console.log(`${DRY_RUN ? 'Aufloesbar (nicht geschrieben)' : 'Geschrieben'}: ${ok}`)
  console.log(`Ohne verwertbare Adresse: ${noAddress.length}`)
  console.log(`Von Nominatim nicht gefunden: ${notFound.length}`)
  console.log(`Fehler: ${failed.length}`)

  if (noAddress.length) {
    console.log('\nOhne Adresse (lat/lng bleibt leer, Fallback PLZ-Zentroid):')
    for (const n of noAddress) console.log(`  - ${n}`)
  }
  if (notFound.length) {
    console.log('\nNicht aufloesbar (kein Raten — lat/lng bleibt leer):')
    for (const n of notFound) console.log(`  - ${n}`)
  }
  if (failed.length) {
    console.log('\nFehler:')
    for (const n of failed) console.log(`  - ${n}`)
  }

  if (DRY_RUN) {
    console.log('\nDRY-RUN: nichts geschrieben. Zum Schreiben GEOCODE_APPLY=1 setzen.')
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
