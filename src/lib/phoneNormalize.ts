/**
 * Telefonnummer-Normalisierung auf internationales Format (E.164-nah) und
 * wa.me-Link-Bau. Supabase-frei → `node --test`. Block-statt-raten: lässt sich
 * eine Nummer nicht EINDEUTIG normalisieren, kommt null zurück (kein Link).
 */

import { normCountry } from './geoDistance.ts'

/** Ländervorwahl je Land des PLZ-/Adressraums. */
const CALLING_CODE: Record<'AT' | 'DE' | 'CH', string> = {
  AT: '43',
  DE: '49',
  CH: '41',
}

/**
 * Rohe Telefonnummer → '+<int>' (nur Ziffern nach dem Plus) oder null.
 * Regeln:
 *  - '+…' bleibt (Trenner raus),
 *  - '00…' → '+…' (internationaler Präfix),
 *  - nationale '0…' NUR mit bekanntem Land (AT/DE/CH) → '+<cc><rest ohne 0>',
 *  - alles andere (keine 0, kein +, unbekanntes Land bei '0…') → null (raten verboten).
 * Zusätzlich Plausibilität: 8–15 Ziffern gesamt.
 */
export function normalizePhone(
  raw: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return null

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '') // nur Ziffern
  if (digits === '') return null

  let e164: string | null = null
  if (hasPlus) {
    e164 = '+' + digits
  } else if (digits.startsWith('00')) {
    e164 = '+' + digits.slice(2)
  } else if (digits.startsWith('0')) {
    const cc = normCountry(country)
    if (!cc) return null // nationale Nummer ohne Land → nicht eindeutig
    e164 = '+' + CALLING_CODE[cc] + digits.slice(1)
  } else {
    return null // weder +, noch 00, noch 0 → mehrdeutig
  }

  const n = e164.replace(/\D/g, '')
  if (n.length < 8 || n.length > 15) return null
  return e164
}

/**
 * wa.me-Link aus einer normalisierten Nummer + Text. Ohne Nummer null. wa.me
 * erwartet die Nummer OHNE '+' und ohne Trenner.
 */
export function waMeLink(e164: string | null, text: string): string | null {
  if (!e164) return null
  const digits = e164.replace(/\D/g, '')
  if (digits === '') return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
