/**
 * Versandart-Logik (Anzeige + Validierung) als supabase-freier Kern → unter
 * `node --test` prüfbar (siehe KONVENTIONEN in CLAUDE.md).
 *
 * Hintergrund: Die Versandart lebt an der Order im bestehenden Feld
 * `shipping_method` (app-seitig validiertes Enum, KEIN DB-CHECK). Neben den festen
 * Anbietern DPD/DSV gibt es den Wert „sonstige" mit einem Freitext
 * (`shipping_method_freitext`), den die Mitarbeiter je Auftrag selbst befüllen.
 *
 * Dieser Kern hält drei Dinge zentral: (1) die Validierung „sonstige braucht
 * Freitext" (block-statt-raten), (2) das Aufräumen widersprüchlicher Zustände
 * (Freitext nur bei „sonstige"), (3) den Anzeige-Text für die Belege.
 */

/** Enum-Wert für den frei anpassbaren Versand („to be customized"). */
export const SHIPPING_SONSTIGE = 'sonstige'

/** Anzeige-Sprache der Belege. */
export type ShippingLang = 'de' | 'en'

/**
 * Anzeige-Text der Versandart für Belege (AB). DPD/DSV sind sprachneutrale
 * Anbieternamen; „sonstige" zeigt den vom Mitarbeiter eingegebenen Freitext.
 * Fehlt bei „sonstige" (unerwartet) der Freitext, greift ein lokalisierter
 * Fallback („Sonstige"/„Other"). Ohne gesetzte Versandart → null (keine Zeile).
 */
export function shippingDisplay(
  method: string | null | undefined,
  freitext: string | null | undefined,
  lang: ShippingLang,
): string | null {
  const m = (method ?? '').trim()
  if (m === '') return null
  if (m === 'dpd') return 'DPD'
  if (m === 'dsv') return 'DSV'
  if (m === SHIPPING_SONSTIGE) {
    const f = (freitext ?? '').trim()
    return f !== '' ? f : lang === 'en' ? 'Other' : 'Sonstige'
  }
  // Unbekannter Altwert: unverändert anzeigen (kein stiller Verlust).
  return m
}

/**
 * Validiert die Versandart-Eingabe (block-statt-raten): ist „sonstige" gewählt,
 * MUSS der Freitext gefüllt sein — sonst ein i18n-Fehlerkey, den die UI zeigt.
 * DPD/DSV und „keine Versandart" sind immer gültig.
 */
export type ShippingParse = { ok: true } | { ok: false; error: string }

export function validateShipping(input: {
  method: string
  freitext: string
}): ShippingParse {
  if (input.method === SHIPPING_SONSTIGE && input.freitext.trim() === '') {
    return { ok: false, error: 'order.ship.err.freitextRequired' }
  }
  return { ok: true }
}

/**
 * Räumt einen widersprüchlichen Zustand auf: der Freitext ist NUR bei „sonstige"
 * relevant. Bei DPD/DSV/leer wird ein evtl. vorhandener Freitext auf null
 * gesetzt, bei „sonstige" getrimmt (leer → null). So landet nie ein
 * verwaister Freitext zu einem festen Anbieter in der DB.
 */
export function normalizeShippingFreitext(
  method: string,
  freitext: string,
): string | null {
  if (method !== SHIPPING_SONSTIGE) return null
  const t = freitext.trim()
  return t === '' ? null : t
}
