import {
  DEFAULT_SKONTO_PROZENT,
  DEFAULT_SKONTO_TAGE,
  DEFAULT_ZAHLUNGSZIEL_TAGE,
  computeSkonto,
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
 * Ergebnis eines toleranten Formularfeld-Parsers: gültig (mit Wert, `null` bei
 * leerem Feld) ODER ungültig. Leer bleibt bewusst gültig → `null` (Händler ohne
 * Skonto). Der Aufrufer zeigt bei `ok: false` einen sichtbaren Fehler, statt
 * einen nicht deutbaren Wert still zu `null` zu machen (früherer Datenverlust).
 */
export type FieldParse = { ok: true; value: number | null } | { ok: false }

/**
 * Dezimalfeld aus einem Formular. Toleriert ein abschließendes „%" und
 * Leerzeichen sowie Dezimalkomma: „10", „10%", „10 %", „10,5" → Zahl. Leer →
 * null (gültig). Alles andere (z. B. „abc", „10x") → ungültig — KEIN stilles
 * null. Basis für Skonto-Prozent, Rabatt und Kreditlimit.
 */
export function parseDecimalField(raw: string): FieldParse {
  const t = raw.trim().replace(/\s*%\s*$/, '').trim().replace(',', '.')
  if (t === '') return { ok: true, value: null }
  const n = Number(t)
  return Number.isNaN(n) ? { ok: false } : { ok: true, value: n }
}

/** Skonto-Prozent: identisch zum generischen Dezimalfeld (nur semantischer Name). */
export function parseSkontoPercent(raw: string): FieldParse {
  return parseDecimalField(raw)
}

/**
 * Ganzzahliges Feld (Skonto-Tage, Zahlungsziel). Strikt: nach Trim nur Ziffern
 * (ein „%" am Ende wird geduldet, damit „7%" nicht als Fehler zählt). Leer →
 * null. Alles andere → ungültig — KEIN stilles `parseInt` mehr, das „2x" zu 2
 * verkürzt.
 */
export function parseIntField(raw: string): FieldParse {
  const t = raw.trim().replace(/\s*%\s*$/, '').trim()
  if (t === '') return { ok: true, value: null }
  if (!/^\d+$/.test(t)) return { ok: false }
  return { ok: true, value: Number.parseInt(t, 10) }
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

// ─── Zahlungsbedingungen je Auftragsbestätigung ──────────────────────────────

/**
 * EUR-Betrag als de-DE-String (Tausenderpunkt, Komma, 2 Nachkommastellen) OHNE
 * Währungssymbol — der Aufrufer setzt „EUR " davor. BEWUSST manuell formatiert
 * (kein Intl/toLocaleString), damit diese reine Funktion unter `node --test`
 * deterministisch und locale-unabhängig ist. 12.34 → „12,34", 1234.5 → „1.234,50".
 */
function fmtEuroAmount(n: number): string {
  const cents = Math.round(Math.abs(n) * 100)
  const euros = Math.floor(cents / 100)
  const rest = cents % 100
  const sign = n < 0 ? '-' : ''
  const eurStr = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${eurStr},${String(rest).padStart(2, '0')}`
}

/** Sprache der Belegtexte. */
export type PaymentTermsLang = 'de' | 'en'

/** Eingaben für den Belegtext der Zahlungsbedingungen. */
export interface PaymentTermsTextInput {
  /** Zahlungsziel in Tagen (netto). */
  zahlungszielTage: number
  /** Skontosatz in Prozent; null/0 → kein Skonto. */
  skontoProzent: number | null
  /** Skontofrist in Tagen; null/0 → kein Skonto. */
  skontoTage: number | null
  /** Freitext für Sonderfälle; wird als eigene Zeile angehängt (oder null). */
  freitext: string | null
  sprache: PaymentTermsLang
  /**
   * Bruttobetrag für den ausgewiesenen Skonto-Abzug (EUR). Fehlt er (z. B. AB mit
   * noch unklarer Steuer → kein Brutto), wird der Skonto-Satz OHNE Betrag genannt.
   */
  bruttoBetrag?: number | null
}

/**
 * Baut den Zahlungsbedingungs-Text für Belege (AB, DE/EN), z. B.:
 *   DE: „Zahlbar innerhalb 30 Tagen netto. Bei Zahlung innerhalb 10 Tagen 2 %
 *        Skonto (EUR 12,34)."
 *   EN: „Payable within 30 days net. On payment within 10 days 2 % cash discount
 *        (EUR 12,34)."
 *
 * Ohne Skonto (skontoProzent null/0 oder skontoTage null/0): nur der
 * Zahlungsziel-Satz. Ein Freitext wird — sofern vorhanden — als eigene Zeile
 * (mit „\n") angehängt. Der Skonto-Betrag kommt zentral aus computeSkonto (auf
 * Cent gerundet); Beträge bleiben de-DE/EUR unabhängig von der Sprache
 * (österreichisches Unternehmen, wie die übrigen Belegzahlen).
 */
export function buildPaymentTermsText(input: PaymentTermsTextInput): string {
  const { zahlungszielTage, skontoProzent, skontoTage, freitext, sprache } = input
  const de = sprache === 'de'

  // Zahlungsziel-Satz (Sonderfall 0 Tage = sofort fällig).
  let text: string
  if (zahlungszielTage <= 0) {
    text = de ? 'Zahlbar sofort netto.' : 'Payable immediately, net.'
  } else {
    text = de
      ? `Zahlbar innerhalb ${zahlungszielTage} Tagen netto.`
      : `Payable within ${zahlungszielTage} days net.`
  }

  // Skonto nur, wenn Satz UND Frist gesetzt sind.
  const hasSkonto =
    skontoProzent !== null &&
    skontoProzent > 0 &&
    skontoTage !== null &&
    skontoTage > 0
  if (hasSkonto) {
    const pct = fmtNum(skontoProzent as number)
    // Betrag nur ausweisen, wenn ein Brutto vorliegt (sonst Satz ohne Betrag).
    let amountPart = ''
    if (input.bruttoBetrag != null) {
      const { amount } = computeSkonto(input.bruttoBetrag, skontoProzent as number)
      amountPart = ` (EUR ${fmtEuroAmount(amount)})`
    }
    text += de
      ? ` Bei Zahlung innerhalb ${skontoTage} Tagen ${pct} % Skonto${amountPart}.`
      : ` On payment within ${skontoTage} days ${pct} % cash discount${amountPart}.`
  }

  // Freitext als eigene Zeile (Sonderfälle), falls vorhanden.
  const extra = freitext?.trim()
  if (extra) text += `\n${extra}`

  return text
}

/**
 * Validiert die Zahlungsbedingungs-Formularfelder einer Order (block-statt-raten,
 * kein stiller Datenverlust) und gibt die geparsten Werte zurück. Bei Fehler
 * einen i18n-Key, den die UI als sichtbare Meldung zeigt — statt einen unklaren
 * Wert still zu verwerfen.
 *
 * Regeln:
 *   • zahlungsziel_tage: ganze Zahl; leer → Default 30.
 *   • skonto_prozent: leer → kein Skonto; sonst 0–100.
 *   • skonto_tage: leer → kein Skonto; sonst ganze Zahl.
 *   • Skonto nur vollständig (Prozent > 0 UND Tage > 0) oder gar nicht — halb
 *     ausgefüllt ist ein Fehler (mehrdeutig).
 *   • skonto_tage <= zahlungsziel_tage.
 */
export type OrderPaymentTermsParse =
  | {
      ok: true
      value: {
        zahlungsziel_tage: number
        skonto_prozent: number | null
        skonto_tage: number | null
      }
    }
  | { ok: false; error: string }

/**
 * Bestimmt, welche Zahlungsbedingungen eine Rechnung EINFRIERT — Session 2 des
 * Order→Rechnung-Links.
 *
 * Ist die Rechnung mit einer Order verlinkt (delivery.order_id), gewinnt IMMER
 * die Order: ihr Zahlungsziel und ihr Skonto werden 1:1 genommen (kein Auffüllen
 * mit dem WARM-ME-Standard — die Order-Werte sind die bewusste Entscheidung der
 * Mitarbeiterin, „kein Skonto" bleibt „kein Skonto"). Der Freitext kommt ebenfalls
 * aus der Order. Ohne Order-Link (Altlieferung / freie Rechnung) gelten die bereits
 * gefüllten Händlerkonditionen (effectivePaymentTerms) und kein Freitext.
 */
export interface InvoiceOrderTerms {
  zahlungsziel_tage: number
  skonto_prozent: number | null
  skonto_tage: number | null
  freitext: string | null
}

export interface FrozenInvoiceTerms {
  zahlungsziel_tage: number
  /** 0 = kein Skonto. */
  skonto_prozent: number
  skonto_tage: number
  freitext: string | null
}

export function resolveInvoicePaymentTerms(
  order: InvoiceOrderTerms | null,
  dealerEffective: {
    zahlungsziel_tage: number
    skonto_prozent: number
    skonto_tage: number
  },
): FrozenInvoiceTerms {
  if (order) {
    const freitext = order.freitext?.trim()
    return {
      zahlungsziel_tage: order.zahlungsziel_tage,
      skonto_prozent: order.skonto_prozent ?? 0,
      skonto_tage: order.skonto_tage ?? 0,
      freitext: freitext ? freitext : null,
    }
  }
  return {
    zahlungsziel_tage: dealerEffective.zahlungsziel_tage,
    skonto_prozent: dealerEffective.skonto_prozent,
    skonto_tage: dealerEffective.skonto_tage,
    freitext: null,
  }
}

/**
 * Manuelle Überschreibungen der Zahlungskonditionen bei der Rechnungserstellung
 * (S3). Jedes Feld optional: fehlt es, gilt der aus AB/Händler abgeleitete
 * Standard. `0` ist ein gültiger Wert (z. B. „kein Skonto", „sofort fällig") und
 * wird NICHT als „nicht gesetzt" behandelt.
 */
export interface InvoiceTermOverrides {
  zahlungsziel_tage?: number
  skonto_prozent?: number
  skonto_tage?: number
  zahlungsbedingung_freitext?: string | null
}

/**
 * Standard-Konditionen mit den manuellen Überschreibungen zusammenführen und die
 * einzufrierenden Konditionen zurückgeben. Rein (keine Supabase-Abhängigkeit),
 * damit unter `node --test` prüfbar.
 */
export function applyInvoiceTermOverrides(
  defaults: FrozenInvoiceTerms,
  overrides?: InvoiceTermOverrides,
): FrozenInvoiceTerms {
  if (!overrides) return defaults
  const freitextSet = overrides.zahlungsbedingung_freitext !== undefined
  return {
    zahlungsziel_tage: overrides.zahlungsziel_tage ?? defaults.zahlungsziel_tage,
    skonto_prozent: overrides.skonto_prozent ?? defaults.skonto_prozent,
    skonto_tage: overrides.skonto_tage ?? defaults.skonto_tage,
    freitext: freitextSet
      ? overrides.zahlungsbedingung_freitext?.trim() || null
      : defaults.freitext,
  }
}

export function validateOrderPaymentTerms(form: {
  zahlungsziel_tage: string
  skonto_prozent: string
  skonto_tage: string
}): OrderPaymentTermsParse {
  const ziel = parseIntField(form.zahlungsziel_tage)
  if (!ziel.ok) return { ok: false, error: 'order.payment.err.zielInvalid' }
  const zielTage = ziel.value ?? DEFAULT_ZAHLUNGSZIEL_TAGE

  const sp = parseDecimalField(form.skonto_prozent)
  if (!sp.ok) return { ok: false, error: 'order.payment.err.skontoProzentInvalid' }
  if (sp.value !== null && (sp.value < 0 || sp.value > 100)) {
    return { ok: false, error: 'order.payment.err.skontoRange' }
  }

  const st = parseIntField(form.skonto_tage)
  if (!st.ok) return { ok: false, error: 'order.payment.err.skontoTageInvalid' }

  const skontoAktiv = sp.value !== null && sp.value > 0
  const tageGesetzt = st.value !== null && st.value > 0

  // Halb ausgefüllt (nur Prozent oder nur Tage) → mehrdeutig, blocken.
  if (skontoAktiv !== tageGesetzt) {
    return { ok: false, error: 'order.payment.err.skontoIncomplete' }
  }
  // Skontofrist darf das Zahlungsziel nicht überschreiten.
  if (skontoAktiv && (st.value as number) > zielTage) {
    return { ok: false, error: 'order.payment.err.skontoTageVsZiel' }
  }

  return {
    ok: true,
    value: {
      zahlungsziel_tage: zielTage,
      skonto_prozent: skontoAktiv ? (sp.value as number) : null,
      skonto_tage: skontoAktiv ? (st.value as number) : null,
    },
  }
}
