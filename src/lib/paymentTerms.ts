import {
  DEFAULT_SKONTO_PROZENT,
  DEFAULT_SKONTO_TAGE,
  DEFAULT_ZAHLUNGSZIEL_TAGE,
  type PaymentTerms,
} from './tax.ts'

// Hinweis: Import mit expliziter .ts-Endung, damit diese reine Funktion (und
// ihre Unit-Tests) auch direkt mit dem Node-Test-Runner laufen. tax.ts ist die
// einzige Quelle der Standard-Konditionen — hier wird nichts hartkodiert.

/**
 * Zerlegt einen Zahlungskonditions-Rohstring (Spalte payment_terms_raw) in
 * strukturierte Konditionen.
 *
 * Erkannte Formen (Groß-/Kleinschreibung und Leerzeichen egal):
 *   "3%10T N30T"      → 3 % Skonto / 10 Tage, netto 30 Tage
 *   "4,00%10T N30T"   → Dezimal-Komma erlaubt
 *   "N30T"            → nur netto (kein Skonto: 0 % / 0 Tage)
 *   "Netto sofort"    → sofort fällig (Zahlungsziel 0), kein Skonto
 *   ""/null/undefined → WARM-ME-Standard (3 % / 10 Tage, netto 30)
 *
 * WICHTIG: Diese Funktion wird erst beim späteren Händler-Import genutzt.
 * In diesem Schritt nur definiert und getestet — sie wird hier nicht aufgerufen.
 */
export function parsePaymentTerms(
  raw: string | null | undefined,
): PaymentTerms {
  // Leer/null → Hausstandard (inkl. Skonto).
  if (raw === null || raw === undefined || raw.trim() === '') {
    return {
      skonto_prozent: DEFAULT_SKONTO_PROZENT,
      skonto_tage: DEFAULT_SKONTO_TAGE,
      zahlungsziel_tage: DEFAULT_ZAHLUNGSZIEL_TAGE,
    }
  }

  const lower = raw.trim().toLowerCase()

  // "Netto sofort" / "sofort" → sofort fällig, kein Skonto.
  if (lower.includes('sofort')) {
    return { skonto_prozent: 0, skonto_tage: 0, zahlungsziel_tage: 0 }
  }

  const toNum = (t: string): number => Number(t.replace(',', '.'))

  // Skonto-Teil: <prozent> % <tage> T  (Dezimalkomma/-punkt erlaubt).
  const sk = lower.match(/(\d+(?:[.,]\d+)?)\s*%\s*(\d+)\s*t/)
  // Netto-Teil: N <tage> T
  const net = lower.match(/n\s*(\d+)\s*t/)

  const skonto_prozent = sk ? toNum(sk[1]) : 0
  const skonto_tage = sk ? toNum(sk[2]) : 0
  // Zahlungsziel: aus dem Netto-Teil; fehlt er (nur Skonto angegeben), gilt der
  // Standard.
  const zahlungsziel_tage = net ? toNum(net[1]) : DEFAULT_ZAHLUNGSZIEL_TAGE

  return { skonto_prozent, skonto_tage, zahlungsziel_tage }
}

/** Zahl ohne überflüssige Nachkommastellen (4.00 → "4", 3.5 → "3,5" mit Komma). */
function fmtNum(n: number): string {
  return String(n).replace('.', ',')
}

/**
 * Gegenstück zu {@link parsePaymentTerms}: baut aus strukturierten Konditionen
 * den kanonischen Rohstring (Spalte payment_terms_raw), damit Rohstring und
 * strukturierte Felder nach dem Speichern nie widersprechen.
 *
 * Regeln (round-trip-stabil mit parsePaymentTerms):
 *   {3, 10, 30}       → "3%10T N30T"
 *   {0/null, _, 30}   → "N30T"        (kein Skonto)
 *   {0/null, _, 0}    → "Netto sofort"
 *   alles leer/0/null → null          (keine Kondition hinterlegt → Hausstandard)
 */
export function formatPaymentTerms(t: {
  skonto_prozent: number | null
  skonto_tage: number | null
  zahlungsziel_tage: number | null
}): string | null {
  const sp = t.skonto_prozent
  const st = t.skonto_tage
  const ziel = t.zahlungsziel_tage

  const noSkonto = sp === null || sp <= 0
  const noZiel = ziel === null

  // Nichts hinterlegt → kein Rohstring (downstream gilt dann der Hausstandard).
  if (noSkonto && noZiel && (st === null || st <= 0)) return null

  // Sofort fällig, kein Skonto.
  if (ziel === 0 && noSkonto) return 'Netto sofort'

  const zielT = ziel ?? DEFAULT_ZAHLUNGSZIEL_TAGE

  if (!noSkonto && st !== null && st > 0) {
    return `${fmtNum(sp as number)}%${st}T N${zielT}T`
  }
  return `N${zielT}T`
}
