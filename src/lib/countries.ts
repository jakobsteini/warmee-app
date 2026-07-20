// Saubere ISO2-Länderliste für das Kunden-Formular (ersetzt das Freitext-Chaos
// "A (EU)"/"USA"/"CH" im alten country-Feld). EU-27 + gängige Drittländer;
// fehlende ergänzt man bei Bedarf. Reine Daten, supabase-frei.
//
// EU-Zugehörigkeit wird NICHT hier dupliziert — die maßgebliche Menge ist
// EU_ISO2 in taxCalc.ts. `eu` dient nur der Gruppierung/Anzeige im Dropdown.

export interface Country {
  /** ISO2-Code (Großbuchstaben), z. B. 'AT', 'DE', 'CH'. */
  code: string
  de: string
  en: string
  /** EU-Mitglied (nur zur Gruppierung im Dropdown). */
  eu: boolean
}

/** EU-27 zuerst (alphabetisch nach DE-Name), danach gängige Drittländer. */
export const COUNTRIES: readonly Country[] = [
  { code: 'AT', de: 'Österreich', en: 'Austria', eu: true },
  { code: 'BE', de: 'Belgien', en: 'Belgium', eu: true },
  { code: 'BG', de: 'Bulgarien', en: 'Bulgaria', eu: true },
  { code: 'HR', de: 'Kroatien', en: 'Croatia', eu: true },
  { code: 'CY', de: 'Zypern', en: 'Cyprus', eu: true },
  { code: 'CZ', de: 'Tschechien', en: 'Czechia', eu: true },
  { code: 'DK', de: 'Dänemark', en: 'Denmark', eu: true },
  { code: 'EE', de: 'Estland', en: 'Estonia', eu: true },
  { code: 'FI', de: 'Finnland', en: 'Finland', eu: true },
  { code: 'FR', de: 'Frankreich', en: 'France', eu: true },
  { code: 'DE', de: 'Deutschland', en: 'Germany', eu: true },
  { code: 'GR', de: 'Griechenland', en: 'Greece', eu: true },
  { code: 'HU', de: 'Ungarn', en: 'Hungary', eu: true },
  { code: 'IE', de: 'Irland', en: 'Ireland', eu: true },
  { code: 'IT', de: 'Italien', en: 'Italy', eu: true },
  { code: 'LV', de: 'Lettland', en: 'Latvia', eu: true },
  { code: 'LT', de: 'Litauen', en: 'Lithuania', eu: true },
  { code: 'LU', de: 'Luxemburg', en: 'Luxembourg', eu: true },
  { code: 'MT', de: 'Malta', en: 'Malta', eu: true },
  { code: 'NL', de: 'Niederlande', en: 'Netherlands', eu: true },
  { code: 'PL', de: 'Polen', en: 'Poland', eu: true },
  { code: 'PT', de: 'Portugal', en: 'Portugal', eu: true },
  { code: 'RO', de: 'Rumänien', en: 'Romania', eu: true },
  { code: 'SK', de: 'Slowakei', en: 'Slovakia', eu: true },
  { code: 'SI', de: 'Slowenien', en: 'Slovenia', eu: true },
  { code: 'ES', de: 'Spanien', en: 'Spain', eu: true },
  { code: 'SE', de: 'Schweden', en: 'Sweden', eu: true },
  // ─── Gängige Drittländer ───────────────────────────────────────────────
  { code: 'CH', de: 'Schweiz', en: 'Switzerland', eu: false },
  { code: 'GB', de: 'Vereinigtes Königreich', en: 'United Kingdom', eu: false },
  { code: 'US', de: 'USA', en: 'United States', eu: false },
  { code: 'NO', de: 'Norwegen', en: 'Norway', eu: false },
  { code: 'LI', de: 'Liechtenstein', en: 'Liechtenstein', eu: false },
  { code: 'IS', de: 'Island', en: 'Iceland', eu: false },
  { code: 'CA', de: 'Kanada', en: 'Canada', eu: false },
  { code: 'AU', de: 'Australien', en: 'Australia', eu: false },
  { code: 'JP', de: 'Japan', en: 'Japan', eu: false },
  { code: 'AE', de: 'Vereinigte Arab. Emirate', en: 'United Arab Emirates', eu: false },
]

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

/** Länder-Anzeigename in der gewünschten Sprache; Fallback = Code. */
export function countryLabel(code: string | null | undefined, lang: 'de' | 'en'): string {
  if (!code) return ''
  const c = BY_CODE.get(code.toUpperCase())
  return c ? c[lang] : code
}
