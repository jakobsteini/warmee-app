/**
 * Umsatzsteuer (Österreich).
 *
 * WARM ME ist regelbesteuert — KEIN Kleinunternehmer. Der Regelsteuersatz
 * beträgt 20 %. Zentral hier definiert, damit Rechnungsberechnung, PDF und
 * UI denselben Satz verwenden. Die Zahl darf nirgends sonst hardcodiert sein.
 */

import { addDaysIso } from './dates.ts'

/** Umsatzsteuer-Regelsatz als Faktor (0.20 = 20 %). */
export const VAT_RATE = 0.2

/** Steuersatz in Prozent für die Anzeige, z. B. „USt (20 %)". */
export const VAT_RATE_PERCENT = Math.round(VAT_RATE * 100)

/** Kaufmännisch auf ganze Cent runden. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Nettobetrag → { net, tax, gross } mit dem Regelsteuersatz, jeweils auf
 * ganze Cent gerundet. Basis für die Steuerausweisung auf der Rechnung.
 */
export function applyVat(net: number): {
  net: number
  tax: number
  gross: number
} {
  const n = roundCents(net)
  const tax = roundCents(n * VAT_RATE)
  return { net: n, tax, gross: roundCents(n + tax) }
}

// ─── Zahlungskonditionen ─────────────────────────────────────────────────────
//
// WARM-ME-Standard laut echten Belegen: 3 % Skonto bei Zahlung innerhalb von
// 10 Tagen, netto 30 Tage. Diese Defaults sind die zentrale Quelle — die alte
// „14 Tage netto"-Annahme ist damit ersetzt. Pro Händler können abweichende
// Konditionen gelten (Felder aus der Migration: skonto_prozent, skonto_tage,
// zahlungsziel_tage); greifen sie nicht, gilt der Standard.

/** Standard-Zahlungsziel in Tagen (netto). */
export const DEFAULT_ZAHLUNGSZIEL_TAGE = 30
/** Standard-Skontosatz in Prozent. */
export const DEFAULT_SKONTO_PROZENT = 3
/** Standard-Skontofrist in Tagen. */
export const DEFAULT_SKONTO_TAGE = 10

/** Strukturierte Zahlungskonditionen (alle Felder gesetzt). */
export interface PaymentTerms {
  skonto_prozent: number
  skonto_tage: number
  zahlungsziel_tage: number
}

/**
 * Möglicherweise unvollständige Konditionen, wie sie am Händler hängen
 * (Migrationsspalten sind nullable; numeric kann als String ankommen).
 */
export interface PartialPaymentTerms {
  skonto_prozent?: number | string | null
  skonto_tage?: number | null
  zahlungsziel_tage?: number | null
}

/** Wert übernehmen, falls gesetzt (null/undefined/'' → Fallback). 0 gilt als gesetzt. */
function orDefault(v: number | string | null | undefined, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? fallback : n
}

/**
 * Effektive Konditionen eines Händlers: pro Feld der Händlerwert, falls
 * gesetzt — sonst der WARM-ME-Standard. Ein explizit gesetztes 0 (z. B.
 * „N30T" ⇒ skonto_prozent 0) bleibt erhalten und wird NICHT durch den
 * Standard-Skonto ersetzt.
 */
export function effectivePaymentTerms(
  terms?: PartialPaymentTerms | null,
): PaymentTerms {
  return {
    skonto_prozent: orDefault(terms?.skonto_prozent, DEFAULT_SKONTO_PROZENT),
    skonto_tage: orDefault(terms?.skonto_tage, DEFAULT_SKONTO_TAGE),
    zahlungsziel_tage: orDefault(
      terms?.zahlungsziel_tage,
      DEFAULT_ZAHLUNGSZIEL_TAGE,
    ),
  }
}

/** Ergebnis einer Skonto-Berechnung. */
export interface SkontoResult {
  prozent: number
  /** Skonto-Abzug in EUR (auf Cent gerundet). */
  amount: number
  /** Zahlbetrag bei Skonto-Nutzung = Brutto − Skonto (auf Cent gerundet). */
  payable: number
}

/**
 * Skonto auf den Bruttobetrag rechnen. Der Rechnungsbetrag selbst bleibt
 * unverändert — das hier ist nur der BEDINGTE Nachlass bei früher Zahlung.
 */
export function computeSkonto(gross: number, prozent: number): SkontoResult {
  const amount = roundCents(gross * (prozent / 100))
  return { prozent, amount, payable: roundCents(gross - amount) }
}

/** Skonto-Zahlungsvorschau für den „Zahlung erfassen"-Dialog. */
export interface SkontoPayment {
  /** Skonto gilt für dieses Zahlungsdatum (innerhalb der Frist) und prozent > 0. */
  applicable: boolean
  /** Skonto-Frist als ISO-Datum (Rechnungsdatum + skonto_tage). */
  deadline: string
  prozent: number
  /** Skonto-Abzug in EUR auf den offenen Rest (0, wenn nicht anwendbar). */
  amount: number
  /** Vorgeschlagener Zahlbetrag: offener Rest − Skonto (bzw. voller Rest). */
  payable: number
}

/**
 * Skonto-Zahlungsvorschau: rechnet den Skonto-Abzug auf den OFFENEN REST (nach
 * Retouren, aus returnsCalc.openAfterReturns) und sagt, ob er für das gewählte
 * Zahlungsdatum noch gilt (paymentDate ≤ Rechnungsdatum + skontoTage).
 *
 * Basis ist bewusst der offene Rest, NICHT das Rechnungsbrutto — Skonto auf
 * retournierte Ware wäre falsch. ISO-Kurzdaten (YYYY-MM-DD) sind lexikografisch
 * vergleichbar; der Frist-Tag selbst zählt noch als fristgerecht.
 */
export function skontoPayment(
  offenerRest: number,
  prozent: number,
  skontoTage: number,
  invoiceDate: string,
  paymentDate: string,
): SkontoPayment {
  const deadline = addDaysIso(invoiceDate, skontoTage)
  const applicable = prozent > 0 && paymentDate <= deadline
  if (!applicable) {
    return {
      applicable: false,
      deadline,
      prozent,
      amount: 0,
      payable: roundCents(offenerRest),
    }
  }
  const { amount, payable } = computeSkonto(offenerRest, prozent)
  return { applicable: true, deadline, prozent, amount, payable }
}
