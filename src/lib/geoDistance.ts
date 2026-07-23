/**
 * Umkreissuche — reiner Rechenkern (supabase-frei, `node --test`-fähig).
 * Haversine-Distanz, Ranking nach Entfernung und Radius-Filter. Zusätzlich die
 * Normalisierung der unsauberen Länder-Codes der Echtdaten auf AT/DE/CH.
 */

/** Ein geografischer Punkt (Dezimalgrad). */
export interface LatLng {
  lat: number
  lng: number
}

/** Erdradius in km (mittlerer). */
const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Luftlinie zwischen zwei Punkten in km (Haversine). Für Umkreissuchen genau
 * genug (< 0,5 % Fehler ggü. Ellipsoid).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Ein Element mit (optionaler) Koordinate für das Ranking. */
export interface GeoItem<T> {
  item: T
  /** null = keine Koordinate (z. B. keine/unbekannte PLZ) → ans Ende. */
  coord: LatLng | null
}

/** Ein Element mit berechneter Entfernung (null = keine Koordinate). */
export interface RankedItem<T> {
  item: T
  distanceKm: number | null
}

/**
 * Nach Entfernung zum Ursprung aufsteigend sortieren. Elemente OHNE Koordinate
 * bekommen distanceKm=null und stehen ganz hinten (nicht weggeworfen — kein
 * stiller Datenverlust; der Aufrufer weist sie sichtbar aus).
 */
export function rankByDistance<T>(
  origin: LatLng,
  items: GeoItem<T>[],
): RankedItem<T>[] {
  return items
    .map((g) => ({
      item: g.item,
      distanceKm: g.coord ? haversineKm(origin, g.coord) : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0
      if (a.distanceKm === null) return 1
      if (b.distanceKm === null) return -1
      return a.distanceKm - b.distanceKm
    })
}

/** Nur die Elemente innerhalb des Radius (km), mit Koordinate. */
export function withinRadius<T>(
  ranked: RankedItem<T>[],
  radiusKm: number,
): RankedItem<T>[] {
  return ranked.filter((r) => r.distanceKm !== null && r.distanceKm <= radiusKm)
}

/**
 * Unsaubere Länder-Angabe der Echtdaten auf AT/DE/CH normalisieren (die drei
 * Länder des PLZ-Verzeichnisses). Deckt die real vorkommenden Formen ab —
 * deutsche Kürzel ("A (EU)", "D (EU)", "CH", "DE (EU)") und ISO ("AT", "DE").
 * Alles andere (Italien, USA, …) → null (außerhalb des Verzeichnisses).
 */
export function normCountry(raw: string | null | undefined): 'AT' | 'DE' | 'CH' | null {
  const s = (raw ?? '').replace(/[^a-z]/gi, '').toUpperCase()
  if (s === '') return null
  if (s === 'A' || s === 'AT' || s === 'AUT' || s.startsWith('AEU') || s.startsWith('OSTER'))
    return 'AT'
  if (s === 'D' || s === 'DE' || s === 'DEU' || s.startsWith('DEEU') || s.startsWith('GER') || s.startsWith('DEUTSCH'))
    return 'DE'
  if (s === 'CH' || s.startsWith('CHEU') || s.startsWith('SCHW') || s.startsWith('SWIT'))
    return 'CH'
  return null
}

// ============================================================================
// Standort-Umkreissuche (Handy): Praezise Adress-Koordinate mit Fallback auf den
// PLZ-Zentroid, Entfernungs-Formatierung (Meter unter 1 km) und Deep-Links fuer
// Anruf/Route. Alles supabase-frei und rein → unter `node --test` pruefbar.
// ============================================================================

/** Ergebnis der Punkt-Aufloesung: welche Koordinate gilt, und wie genau. */
export interface ResolvedPoint {
  coord: LatLng
  /** true = PLZ-Zentroid (ungefaehr), false = echte Adress-Koordinate. */
  approximate: boolean
}

/**
 * Distanz-Grundlage eines Haendlers bestimmen — KEIN stiller Datenverlust:
 *  - echte Adress-Koordinate (lat/lng geokodiert) → exakt (approximate=false),
 *  - sonst PLZ-Zentroid → ungefaehr (approximate=true),
 *  - keins von beidem → null (Aufrufer weist den Haendler sichtbar als „ohne
 *    Koordinate" aus, statt ihn wegzuwerfen).
 * Es wird nie geraten: ohne echte Koordinate UND ohne Zentroid gibt es keinen Punkt.
 */
export function resolveDealerPoint(
  precise: LatLng | null,
  fallback: LatLng | null,
): ResolvedPoint | null {
  if (precise) return { coord: precise, approximate: false }
  if (fallback) return { coord: fallback, approximate: true }
  return null
}

/** Ganze Zahl auf den naechsten Schritt runden (z. B. Meter auf 10er). */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

/**
 * Entfernung menschenlesbar formatieren (deutsches Zahlenformat, internes Tool):
 *  - unter 1 km → Meter auf 10 m gerundet, z. B. „450 m",
 *  - 1 bis unter 10 km → eine Nachkommastelle mit Komma, z. B. „3,2 km"
 *    (glatte Werte ohne „,0", z. B. „5 km"),
 *  - ab 10 km → ganze Kilometer, z. B. „24 km".
 * Negative Eingaben werden wie 0 behandelt.
 */
export function formatDistance(km: number): string {
  const d = km > 0 ? km : 0
  if (d < 1) {
    return `${roundTo(d * 1000, 10)} m`
  }
  if (d < 10) {
    const oneDecimal = Math.round(d * 10) / 10
    return `${oneDecimal.toFixed(1).replace(/\.0$/, '').replace('.', ',')} km`
  }
  return `${Math.round(d)} km`
}

/** `tel:`-Link aus einer bereits normalisierten Nummer (E.164) oder null. */
export function telHref(e164: string | null): string | null {
  if (!e164) return null
  return `tel:${e164}`
}

/**
 * Universeller Google-Maps-Routen-Link zu einer Koordinate. Oeffnet auf dem Handy
 * die native Karten-App (Android/iOS) bzw. im Desktop-Browser Maps. Rein aus den
 * Koordinaten gebaut — keine personenbezogenen Daten in der URL.
 */
export function mapsRouteUrl(coord: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord.lat},${coord.lng}`
}
