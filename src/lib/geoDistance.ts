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
