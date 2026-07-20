// Reine Steuer-Kategorisierung + Satz-/Hinweis-Ableitung — bewusst OHNE
// Supabase-Import, damit sie unter `node --test` (ohne Vite-Env) prüfbar ist
// (Muster wie commissionCalc.ts / returnsCalc.ts / refundCalc.ts). Die
// datenbeschaffende Schicht (dealer + oss_country_rates laden) kommt später und
// delegiert an diesen Kern; die OSS-Sätze werden als reines Objekt reingereicht.
//
// Berührt NICHTS Live — das Einhängen in die Rechnungserzeugung ist ein eigener
// späterer Teil. Der Kern liefert nur: welche Kategorie, welcher Satz, welcher
// Pflichthinweis.
//
// WICHTIG (Nicht-still-Regel): Der Fall „B2C-EU, aber für das Land ist KEIN
// OSS-Satz hinterlegt" darf NIEMALS still 0 % ergeben. taxRateFor meldet ihn
// über das Flag `ossMissing` und fällt sicher auf den AT-Regelsatz (0.20) zurück
// — sichtbar, nicht verschluckt.

/** Umsatzsteuer-Regelsatz Österreich als Faktor (identisch zu tax.ts VAT_RATE). */
export const AT_VAT_RATE = 0.2

/** Heimatland (Inland). */
export const HOME_COUNTRY = 'AT'

/**
 * EU-Mitgliedstaaten als ISO2 (inkl. AT). „EU-Ausland" = diese Menge ohne AT.
 * Stand EU-27.
 */
export const EU_ISO2: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
])

/**
 * Abweichungen zwischen ISO2-Land und dem USt-Nummern-Präfix. Nur Griechenland:
 * ISO2 „GR", aber die UID beginnt mit „EL". Alle übrigen EU-Länder: Präfix =
 * ISO2.
 */
const VAT_PREFIX_OVERRIDE: Record<string, string> = { GR: 'EL' }

/** Die sechs Steuerkategorien (geschlossene Menge). */
export type TaxCategory =
  | 'b2c_at' // B2C Inland → 20 %
  | 'b2c_eu' // B2C EU-Ausland → OSS-Satz des Landes
  | 'b2b_at' // B2B Inland → 20 %
  | 'b2b_eu_uid' // B2B EU mit gültiger UID → Reverse Charge 0 %
  | 'b2b_eu_no_uid' // B2B EU ohne gültige UID → 20 % AT (reguläre Behandlung)
  | 'b2b_third' // B2B Drittland → Ausfuhr 0 %

export type CustomerGroup = 'b2b' | 'b2c'

/** Eingabe für die Kategorisierung (roh vom Händler). */
export interface TaxCategoryInput {
  customer_group: CustomerGroup
  /** ISO2-Land des Kunden (Groß/Klein egal; wird normalisiert). */
  country_iso2: string | null | undefined
  /** UID-Nummer (freier Text) oder leer. */
  uid: string | null | undefined
}

/** Land normalisieren: getrimmt + Großbuchstaben, sonst leer. */
function normCountry(c: string | null | undefined): string {
  return (c ?? '').trim().toUpperCase()
}

/** Ist das Land ein EU-Mitglied (inkl. AT)? */
export function isEuCountry(country_iso2: string | null | undefined): boolean {
  return EU_ISO2.has(normCountry(country_iso2))
}

/**
 * Grobe Offline-Plausibilität einer UID — KEIN VIES. Gültig heißt hier:
 *   • UID vorhanden (nach Trim/Uppercase, Leerzeichen entfernt),
 *   • Land bekannt und das UID-Präfix passt zum Land (GR → „EL", sonst = ISO2),
 *   • dahinter 2–13 alphanumerische Zeichen (grobe Längen-/Formatplausibilität).
 * Das ist bewusst tolerant (fängt nur offensichtlichen Unsinn/falsches Land ab);
 * die echte Prüfung bleibt manuell (uid_verified-Flag).
 */
export function isPlausibleUid(
  uid: string | null | undefined,
  country_iso2: string | null | undefined,
): boolean {
  const country = normCountry(country_iso2)
  if (country === '') return false
  const u = (uid ?? '').replace(/\s+/g, '').toUpperCase()
  if (u === '') return false

  const prefix = VAT_PREFIX_OVERRIDE[country] ?? country
  if (!u.startsWith(prefix)) return false

  const body = u.slice(prefix.length)
  return /^[A-Z0-9]{2,13}$/.test(body)
}

/**
 * Interne Klassifizierung: liefert Kategorie + `review`-Flag. review = true bei
 * Eingaben außerhalb des spezifizierten Modells, die eine menschliche Prüfung
 * brauchen (fehlendes/unbekanntes Land; B2C-Drittland ist nicht Teil der sechs
 * Kategorien). In diesen Fällen wird sicher „getaxt" (Kategorie mit 20 %),
 * niemals still 0 %.
 */
function classify(input: TaxCategoryInput): {
  category: TaxCategory
  review: boolean
} {
  const country = normCountry(input.country_iso2)
  const inEu = EU_ISO2.has(country)
  const isHome = country === HOME_COUNTRY
  const countryKnown = country !== ''

  if (input.customer_group === 'b2c') {
    if (isHome) return { category: 'b2c_at', review: false }
    if (inEu) return { category: 'b2c_eu', review: false }
    // B2C-Drittland (oder unbekanntes Land) ist NICHT im 6-Kategorien-Modell.
    // Sicher: als Inland-B2C behandeln (20 %, „immer Steuer"), aber flaggen.
    return { category: 'b2c_at', review: true }
  }

  // b2b
  if (isHome) return { category: 'b2b_at', review: false }
  if (inEu) {
    return {
      category: isPlausibleUid(input.uid, country) ? 'b2b_eu_uid' : 'b2b_eu_no_uid',
      review: false,
    }
  }
  if (countryKnown) return { category: 'b2b_third', review: false }
  // Unbekanntes Land bei B2B: sicher auf Inland-Regelsatz, flaggen.
  return { category: 'b2b_at', review: true }
}

/** Steuerkategorie aus (Kundentyp + Land + UID) ableiten. */
export function taxCategory(input: TaxCategoryInput): TaxCategory {
  return classify(input).category
}

/** Ergebnis der Satz-Ableitung. */
export interface TaxRateResult {
  /** USt-Satz als Faktor (0.20 = 20 %). */
  rate: number
  /**
   * true nur im Fall b2c_eu OHNE hinterlegten OSS-Satz: Der Satz fällt sichtbar
   * auf den AT-Regelsatz (0.20) zurück — NICHT still 0 %. Der Aufrufer muss das
   * anzeigen und den OSS-Satz nachpflegen.
   */
  ossMissing: boolean
}

/**
 * USt-Satz (Faktor) für eine Kategorie. `ossRates` ist eine reine Map
 * ISO2 → Faktor (kommt später aus oss_country_rates), damit der Kern
 * supabase-frei bleibt.
 *
 *   b2c_at / b2b_at / b2b_eu_no_uid → 0.20
 *   b2b_eu_uid / b2b_third          → 0 (Reverse Charge / Ausfuhr)
 *   b2c_eu                          → ossRates[Land]; fehlt er → 0.20 + ossMissing
 */
export function taxRateFor(
  category: TaxCategory,
  country_iso2: string | null | undefined,
  ossRates: Readonly<Record<string, number>>,
): TaxRateResult {
  switch (category) {
    case 'b2c_at':
    case 'b2b_at':
    case 'b2b_eu_no_uid':
      return { rate: AT_VAT_RATE, ossMissing: false }
    case 'b2b_eu_uid':
    case 'b2b_third':
      return { rate: 0, ossMissing: false }
    case 'b2c_eu': {
      const country = normCountry(country_iso2)
      const rate = ossRates[country]
      if (typeof rate !== 'number' || Number.isNaN(rate)) {
        // KEIN stiller 0 %: sichtbarer Fallback auf den AT-Regelsatz.
        return { rate: AT_VAT_RATE, ossMissing: true }
      }
      return { rate, ossMissing: false }
    }
  }
}

/** Zweisprachiger Pflichthinweis. */
export interface TaxNote {
  de: string
  en: string
}

/**
 * Pflichthinweistext (DE + EN) oder null. Nur Reverse Charge (b2b_eu_uid) und
 * Ausfuhr (b2b_third) tragen einen Pflichthinweis; alle anderen Kategorien null.
 */
export function taxNoteFor(category: TaxCategory): TaxNote | null {
  switch (category) {
    case 'b2b_eu_uid':
      return {
        de: 'Steuerfreie innergemeinschaftliche Lieferung gem. Art. 6 Abs. 1 UStG',
        en: 'Tax-exempt intra-Community supply pursuant to Art. 6 (1) Austrian VAT Act',
      }
    case 'b2b_third':
      return {
        de: 'Steuerfreie Ausfuhrlieferung',
        en: 'Tax-free export delivery',
      }
    default:
      return null
  }
}

/** Kaufmännisch auf ganze Cent runden (identisch zu tax.ts). */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Nettobetrag + Satz → { net, vat, gross }, jeweils auf Cent gerundet. Die
 * rate-parametrisierte Verallgemeinerung von tax.ts applyVat (dort fix 0.20).
 * applyVat(net, AT_VAT_RATE) ist numerisch identisch zu tax.ts applyVat(net).
 */
export function applyVat(
  net: number,
  rate: number,
): { net: number; vat: number; gross: number } {
  const n = roundCents(net)
  const vat = roundCents(n * rate)
  return { net: n, vat, gross: roundCents(n + vat) }
}

/** Vollständiges Ergebnis für einen Beleg (Kategorie + Satz + Hinweis + Flags). */
export interface TaxResult {
  category: TaxCategory
  /** USt-Satz als Faktor. */
  rate: number
  /** Zweisprachiger Pflichthinweis oder null. */
  note: TaxNote | null
  /** b2c_eu ohne hinterlegten OSS-Satz → Fallback 0.20 (siehe taxRateFor). */
  ossMissing: boolean
  /** Eingabe außerhalb des Modells (B2C-Drittland / unbekanntes Land) → prüfen. */
  review: boolean
}

/**
 * Bequemer Gesamt-Resolver: Kategorie + Satz + Hinweis + Flags in einem Schritt.
 * Diese Funktion wird der spätere „Einhängen"-Teil an der Rechnungserzeugung
 * aufrufen und ihr Ergebnis (rate/note/category) in den Beleg EINFRIEREN.
 */
export function taxCalc(
  input: TaxCategoryInput,
  ossRates: Readonly<Record<string, number>>,
): TaxResult {
  const { category, review } = classify(input)
  const { rate, ossMissing } = taxRateFor(category, input.country_iso2, ossRates)
  return { category, rate, note: taxNoteFor(category), ossMissing, review }
}
