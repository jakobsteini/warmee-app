/**
 * Lieferanten-Kontakte: bis zu 3 E-Mail-Kontakte je Lieferant (Name + E-Mail).
 * Supabase-frei und ohne Framework-Import → unter `node --test` prüfbar (wie die
 * übrigen Rechenkerne, siehe KONVENTIONEN in CLAUDE.md).
 *
 * Zweck von `collectSupplierEmails`: die gültigen Kontakt-Adressen eines
 * Lieferanten sammeln (für die spätere Nepal-Order-Mail). Die Haupt-E-Mail des
 * Lieferanten (`producer.email`) ist ein getrenntes Feld und hier bewusst NICHT
 * enthalten — dieser Kern arbeitet ausschließlich auf den 3 Kontaktzeilen.
 */

/** Die 3 Kontakt-E-Mail-Felder eines Lieferanten (jeweils optional). */
export interface SupplierContactEmails {
  kontakt1_email?: string | null
  kontakt2_email?: string | null
  kontakt3_email?: string | null
}

/**
 * Pragmatische E-Mail-Formatprüfung: genau ein „@", davor/dahinter kein
 * Leerraum, und der Domain-Teil enthält mindestens einen Punkt mit Zeichen davor
 * und dahinter. Bewusst tolerant (kein RFC-Vollparser) — soll klare Tippfehler
 * abfangen, nicht exotisch gültige Adressen ablehnen. Trimmt vor der Prüfung.
 */
export function isValidEmail(email: string): boolean {
  const t = email.trim()
  if (t === '') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

/**
 * Gültige, nicht-leere Kontakt-E-Mails eines Lieferanten in stabiler Reihenfolge
 * (Kontakt 1 → 2 → 3). Leere und ungültige Adressen werden herausgefiltert,
 * Duplikate (nach Trim) entfallen. Ergebnis: 0–3 Adressen.
 */
export function collectSupplierEmails(producer: SupplierContactEmails): string[] {
  const raw = [
    producer.kontakt1_email,
    producer.kontakt2_email,
    producer.kontakt3_email,
  ]
  const out: string[] = []
  for (const e of raw) {
    const trimmed = (e ?? '').trim()
    if (trimmed !== '' && isValidEmail(trimmed) && !out.includes(trimmed)) {
      out.push(trimmed)
    }
  }
  return out
}

/**
 * Erste Kontaktzeile (1|2|3), deren E-Mail zwar ausgefüllt, aber ungültig ist —
 * sonst null. Grundlage der „block-statt-raten"-Validierung im Formular: eine
 * eingetragene E-Mail MUSS gültig sein; ein Name ohne E-Mail ist erlaubt, und
 * komplett leere Kontakte sind erlaubt (kein stiller Datenverlust).
 */
export function firstInvalidContactEmail(
  producer: SupplierContactEmails,
): 1 | 2 | 3 | null {
  const rows: [1 | 2 | 3, string | null | undefined][] = [
    [1, producer.kontakt1_email],
    [2, producer.kontakt2_email],
    [3, producer.kontakt3_email],
  ]
  for (const [n, e] of rows) {
    const trimmed = (e ?? '').trim()
    if (trimmed !== '' && !isValidEmail(trimmed)) return n
  }
  return null
}
