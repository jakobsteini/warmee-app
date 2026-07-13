/**
 * Import-Skript: echte Händler aus der Kundendaten-Excel ins dealers-Schema.
 *
 * ARBEITSMODUS: Standardmäßig DRY-RUN — es wird NICHTS in die DB geschrieben.
 * Der Dry-Run liest die Excel, mappt jede echte Händlerzeile auf das
 * dealers-Schema, dedupliziert nach kundennummer und gibt einen Prüf-Report
 * aus. Das scharfe Ausführen (Upsert) ist ein separater, späterer Schritt und
 * nur mit IMPORT_APPLY=1 plus echten Credentials erreichbar.
 *
 *   Dry-Run:   node scripts/importDealers.ts
 *   (später)   IMPORT_APPLY=1 IMPORT_ORG_ID=<uuid> SUPABASE_URL=… \
 *              SUPABASE_SERVICE_ROLE_KEY=… node scripts/importDealers.ts
 *
 * Quelle: "Kundendaten_Order Übersicht pro Kunde FW26.xlsx", Blatt "Kundendaten".
 * Deutsche Feldnamen in der Excel, englische snake_case-Spalten in der DB
 * (CLAUDE.md-Konvention).
 */
import XLSX from 'xlsx' // CommonJS-Default-Import (SheetJS exportiert via module.exports)
import { existsSync } from 'node:fs'
import { parsePaymentTerms } from '../src/lib/paymentTerms.ts'

// ─── Konfiguration ───────────────────────────────────────────────────────────

/** Ziel-Organisation. Im Dry-Run ein Platzhalter — NICHT geraten. */
const ORG_ID =
  process.env.IMPORT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'

/** DRY-RUN ist Default. Nur IMPORT_APPLY=1 würde (später) wirklich schreiben. */
const DRY_RUN = process.env.IMPORT_APPLY !== '1'

const SHEET = 'Kundendaten'
const SOURCE_CANDIDATES = [
  '/Users/js/Downloads/Kundendaten_Order Übersicht pro Kunde FW26.xlsx',
  new URL(
    '../docs/Kundendaten_Order Übersicht pro Kunde FW26.xlsx',
    import.meta.url,
  ).pathname,
]

/** 0-basierte Spaltenindizes laut Kopfzeile (Excel-Zeile 5). */
const COL = {
  kundennummer: 0,
  kurzname: 1,
  auftrDatum: 2, // bewusst NICHT gemappt (Auftrags-Metadaten, gehören in orders)
  bemerkung: 3, // dito
  firmenName: 4,
  ls_strasse: 5,
  ls_land: 6,
  ls_plz: 7,
  ls_ort: 8,
  ls_landbez: 9,
  ls_tel: 10,
  ls_mail1: 11,
  ls_mail2: 12,
  re_name: 13,
  re_strasse: 14,
  re_land: 15,
  re_plz: 16,
  re_ort: 17,
  re_landbez: 18,
  re_tel: 19,
  re_mail1: 20,
  store_name: 21,
  pos_strasse: 22,
  pos_land: 23,
  pos_plz: 24,
  pos_ort: 25,
  pos_landbez: 26,
  pos_tel: 27,
  pos_mail1: 28,
  gegenkto: 29,
  uid: 30,
  inhaber: 31,
  zahlungskond: 32,
} as const

/** Länderkürzel der Excel → ISO-3166-alpha-2 (nur die real vorkommenden Codes). */
const COUNTRY_ISO: Record<string, string> = {
  A: 'AT',
  D: 'DE',
  DE: 'DE',
  I: 'IT',
  CH: 'CH',
  USA: 'US',
  DK: 'DK',
  NOR: 'NO',
  SE: 'SE',
  BE: 'BE',
  ES: 'ES',
  F: 'FR',
  IRL: 'IE',
  UK: 'GB',
}

// ─── Zell-Helfer ─────────────────────────────────────────────────────────────

type Row = (string | number | boolean | null | undefined)[]

/** Getrimmter String oder null. */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Ganzzahl oder null. */
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** PLZ immer als Text (Auslandscodes sind alphanumerisch). */
function plz(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

/** ISO-Land aus "A (EU)" / "CH" / "USA" ableiten (Präfix vor der Klammer). */
function isoCountry(land: string | null): string | null {
  if (!land) return null
  const code = land.split('(')[0].trim().toUpperCase()
  return COUNTRY_ISO[code] ?? null
}

/**
 * E-Mail-Feld bereinigen: nachgestellten Klammer-Zusatz " (…)" entfernen,
 * trimmen; stehen mehrere Adressen drin (Komma/Semikolon/Slash), die erste
 * nehmen. Gibt den bereinigten Wert + Grund zurück (Grund = null ⇒ unverändert).
 */
function cleanEmail(raw: string | null): {
  value: string | null
  reason: string | null
} {
  if (raw === null) return { value: null, reason: null }
  const reasons: string[] = []
  let s = raw.trim()

  const noParen = s.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (noParen !== s) {
    reasons.push('Klammer-Zusatz entfernt')
    s = noParen
  }
  if (/[,;/]/.test(s)) {
    const first = s.split(/[,;/]/)[0].trim()
    if (first !== s) {
      reasons.push('mehrere Adressen → erste')
      s = first
    }
  }
  const value = s === '' ? null : s
  if (reasons.length === 0 && value !== raw) reasons.push('getrimmt')
  return { value, reason: reasons.length ? reasons.join(' + ') : null }
}

// ─── Zeilen-Erkennung ────────────────────────────────────────────────────────

/** Ist die Zeile komplett leer? */
function isEmpty(row: Row): boolean {
  return !row || row.every((c) => c === null || c === undefined || c === '')
}

/** Ist die Zeile die Summenzeile (kein Händler)? */
function isSummary(row: Row): boolean {
  return row.some(
    (c) =>
      typeof c === 'string' && c.trim().toLowerCase().startsWith('ges.summe'),
  )
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

interface DealerRecord {
  org_id: string
  kundennummer: number | null
  name: string
  short_name: string | null
  company_name: string | null
  owner_name: string | null
  contact_name: string | null
  uid: string | null
  gegenkonto: number | null
  email: string | null
  city: string | null
  country: string | null
  payment_terms_raw: string | null
  skonto_prozent: number | null
  skonto_tage: number | null
  zahlungsziel_tage: number | null
  shipping_street: string | null
  shipping_zip: string | null
  shipping_city: string | null
  shipping_country_code: string | null
  shipping_country_name: string | null
  shipping_phone: string | null
  shipping_email: string | null
  shipping_email2: string | null
  billing_name: string | null
  billing_street: string | null
  billing_zip: string | null
  billing_city: string | null
  billing_country_code: string | null
  billing_country_name: string | null
  billing_phone: string | null
  billing_email: string | null
  store_name: string | null
  store_street: string | null
  store_zip: string | null
  store_city: string | null
  store_country_code: string | null
  store_country_name: string | null
  store_phone: string | null
  store_email: string | null
}

/** Protokoll-Eintrag einer E-Mail-Bereinigung. */
interface EmailCleanup {
  kundennummer: number | null
  field: string
  before: string
  after: string
  reason: string
}

/**
 * Eine Excel-Zeile auf das dealers-Schema mappen. Wird ein `log` übergeben,
 * werden alle E-Mail-Bereinigungen (vorher → nachher) protokolliert.
 */
function mapRow(row: Row, log?: EmailCleanup[]): DealerRecord {
  const kdnr = intOrNull(row[COL.kundennummer])
  const company = str(row[COL.firmenName])
  const short = str(row[COL.kurzname])
  const terms = str(row[COL.zahlungskond])
  const parsed = parsePaymentTerms(terms)
  const billingLand = str(row[COL.re_land])

  // E-Mail-Feld lesen + bereinigen (+ optional protokollieren).
  const email = (col: number, field: string): string | null => {
    const raw = str(row[col])
    const c = cleanEmail(raw)
    if (log && raw !== null && c.reason !== null) {
      log.push({
        kundennummer: kdnr,
        field,
        before: raw,
        after: c.value ?? '(leer)',
        reason: c.reason,
      })
    }
    return c.value
  }

  const shipping_email = email(COL.ls_mail1, 'shipping_email (LS-Email1)')
  const shipping_email2 = email(COL.ls_mail2, 'shipping_email2 (LS-Email2)')
  const billing_email = email(COL.re_mail1, 'billing_email (Re-Email1)')
  const store_email = email(COL.pos_mail1, 'store_email (POS-Email1)')

  return {
    org_id: ORG_ID,
    kundennummer: kdnr,
    // Basis-Spalte `name` ist NOT NULL → Firmenname, sonst Kurzname.
    name: company ?? short ?? `Kunde ${kdnr ?? '?'}`,
    short_name: short,
    company_name: company,
    owner_name: str(row[COL.inhaber]),
    // Basis-Spalten für App-Kontinuität (Liste/Beleg lesen name/contact/email/city/country):
    contact_name: str(row[COL.inhaber]),
    uid: str(row[COL.uid]),
    gegenkonto: intOrNull(row[COL.gegenkto]),
    email: billing_email ?? shipping_email, // bereits bereinigt
    city: str(row[COL.re_ort]),
    country: isoCountry(billingLand),
    // Zahlungskonditionen (Rohstring + geparst über den payment_terms-Parser):
    payment_terms_raw: terms,
    skonto_prozent: parsed.skonto_prozent,
    skonto_tage: parsed.skonto_tage,
    zahlungsziel_tage: parsed.zahlungsziel_tage,
    // Lieferadresse (LS-*)
    shipping_street: str(row[COL.ls_strasse]),
    shipping_zip: plz(row[COL.ls_plz]),
    shipping_city: str(row[COL.ls_ort]),
    shipping_country_code: str(row[COL.ls_land]),
    shipping_country_name: str(row[COL.ls_landbez]),
    shipping_phone: str(row[COL.ls_tel]),
    shipping_email,
    shipping_email2,
    // Rechnungsadresse (Re-*)
    billing_name: str(row[COL.re_name]),
    billing_street: str(row[COL.re_strasse]),
    billing_zip: plz(row[COL.re_plz]),
    billing_city: str(row[COL.re_ort]),
    billing_country_code: billingLand,
    billing_country_name: str(row[COL.re_landbez]),
    billing_phone: str(row[COL.re_tel]),
    billing_email,
    // Store-/POS-Adresse (Store Name, POS-*)
    store_name: str(row[COL.store_name]),
    store_street: str(row[COL.pos_strasse]),
    store_zip: plz(row[COL.pos_plz]),
    store_city: str(row[COL.pos_ort]),
    store_country_code: str(row[COL.pos_land]),
    store_country_name: str(row[COL.pos_landbez]),
    store_phone: str(row[COL.pos_tel]),
    store_email,
  }
}

/**
 * Rohzeilen nach kundennummer deduplizieren — DETERMINISTISCH die ERSTE
 * Vorkommnis-Zeile behalten, Original-Reihenfolge erhalten. Nötig, weil die
 * Excel denselben Händler pro Auftrag wiederholt; die Stammdaten sind identisch.
 */
function dedupeRawRows(rows: Row[]): Row[] {
  const seen = new Set<string>()
  const out: Row[] = []
  for (const r of rows) {
    const k = str(r[COL.kundennummer])
    if (k !== null) {
      if (seen.has(k)) continue
      seen.add(k)
    }
    out.push(r)
  }
  return out
}

// ─── Einlesen ────────────────────────────────────────────────────────────────

function findSource(): string {
  for (const p of SOURCE_CANDIDATES) {
    if (p && existsSync(p)) return p
  }
  throw new Error(
    'Quelldatei nicht gefunden. Erwartet:\n  ' + SOURCE_CANDIDATES.join('\n  '),
  )
}

function readDealerRows(path: string): Row[] {
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`Blatt "${SHEET}" nicht gefunden.`)
  const rows = XLSX.utils.sheet_to_json<Row>(ws, {
    header: 1,
    raw: true,
    blankrows: true,
  })

  // Kopfzeile suchen (Zeile mit "KundenNr." in Spalte 0) — laut Struktur Zeile 5.
  const headerIdx = rows.findIndex(
    (r) => str(r[COL.kundennummer])?.toLowerCase() === 'kundennr.',
  )
  if (headerIdx < 0) throw new Error('Kopfzeile ("KundenNr.") nicht gefunden.')

  // Datenzeilen = nach der Kopfzeile, ohne Leerzeilen und ohne Summenzeile.
  return rows.slice(headerIdx + 1).filter((r) => !isEmpty(r) && !isSummary(r))
}

// ─── Zahlungskonditionen klassifizieren (fürs Flagging im Report) ────────────

function classifyTerms(raw: string | null): { status: string; clean: boolean } {
  if (raw === null || raw.trim() === '')
    return { status: 'leer → Standard', clean: false }
  const s = raw.trim().toLowerCase()
  if (s.includes('sofort')) return { status: 'sofort fällig', clean: true }
  const hasNet = /n\s*\d+\s*t/.test(s)
  const hasSk = /\d+(?:[.,]\d+)?\s*%\s*\d+\s*t/.test(s)
  if (hasNet && hasSk) return { status: 'Skonto + Netto', clean: true }
  if (hasNet) return { status: 'nur Netto', clean: true }
  if (hasSk) return { status: 'nur Skonto (Netto=Standard!)', clean: false }
  return { status: 'UNERKANNT → Fallback', clean: false }
}

// ─── Upsert (nur mit IMPORT_APPLY=1 erreichbar; im Dry-Run NIE aufgerufen) ────

async function applyUpsert(records: DealerRecord[]): Promise<void> {
  // Idempotenz: Upsert auf den natürlichen Schlüssel (org_id, kundennummer).
  // Erfordert den Unique-Index dealers(org_id, kundennummer) aus der Migration
  // 20260713120000_realdata_dealers_products.sql.
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'IMPORT_APPLY=1 verlangt SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  const supabase = createClient(url, serviceKey)
  const { error } = await supabase
    .from('dealers')
    .upsert(records, { onConflict: 'org_id,kundennummer' })
  if (error) throw error
  console.log(`✓ ${records.length} Händler upserted.`)
}

// ─── Report (Dry-Run) ────────────────────────────────────────────────────────

function main(): void {
  const path = findSource()
  const rawRows = readDealerRows(path)
  const allRecords = rawRows.map((r) => mapRow(r)) // 145 — für Dup-Analyse
  const dedupRows = dedupeRawRows(rawRows)
  const emailCleanups: EmailCleanup[] = []
  const deduped = dedupRows.map((r) => mapRow(r, emailCleanups)) // 128 — mit Log

  console.log('════════════════════════════════════════════════════════════')
  console.log('  DEALER-IMPORT · DRY-RUN' + (DRY_RUN ? '' : ' · !!! APPLY !!!'))
  console.log('════════════════════════════════════════════════════════════')
  console.log('Quelle:', path)
  console.log('org_id:', ORG_ID, DRY_RUN ? '(Platzhalter)' : '')
  console.log('Erkannte Zeilen (roh):', rawRows.length)

  // Dup-Analyse auf allen 145 (Kontext für Block A).
  const byKdnr = new Map<number, DealerRecord[]>()
  for (const r of allRecords) {
    if (r.kundennummer !== null) {
      const arr = byKdnr.get(r.kundennummer) ?? []
      arr.push(r)
      byKdnr.set(r.kundennummer, arr)
    }
  }
  const dupKdnr = [...byKdnr.entries()].filter(([, rs]) => rs.length > 1)
  const conflicting = dupKdnr.filter(
    ([, rs]) => new Set(rs.map((r) => JSON.stringify(r))).size > 1,
  )

  // ── A) Eindeutige Händler nach Dedup ──
  console.log('\n──── A) EINDEUTIGE HÄNDLER NACH DEDUP ────')
  console.log(
    `${rawRows.length} Zeilen → ${deduped.length} eindeutige Händler ` +
      `(Erwartung 128). Dedup nach kundennummer, erste Zeile behalten.`,
  )
  console.log(
    `Duplikate: ${dupKdnr.length} Kundennummern je 2× — davon ${conflicting.length} ` +
      `mit abweichenden Stammdaten. Rest unterscheidet sich nur in AuftrDatum/` +
      `Bemerkung (Auftrags-Metadaten, nicht importiert) ⇒ Dedup verlustfrei.`,
  )

  // ── B) Zahlungskonditionen (vollständig) ──
  console.log('\n──── B) ZAHLUNGSKONDITIONEN (eindeutige Rohwerte, je Händler) ────')
  const termMap = new Map<string, number>()
  for (const r of deduped) {
    const key = r.payment_terms_raw ?? '(leer)'
    termMap.set(key, (termMap.get(key) ?? 0) + 1)
  }
  const flagged: string[] = []
  for (const [raw, count] of [...termMap.entries()].sort((a, b) => b[1] - a[1])) {
    const rawVal = raw === '(leer)' ? null : raw
    const p = parsePaymentTerms(rawVal)
    const c = classifyTerms(rawVal)
    const mark = c.clean ? '   ' : ' ⚠ '
    console.log(
      `${mark}${String(count).padStart(3)} Händler  ${raw.padEnd(16)} → ` +
        `{ skonto_prozent: ${p.skonto_prozent}, skonto_tage: ${p.skonto_tage}, ` +
        `zahlungsziel_tage: ${p.zahlungsziel_tage} }   [${c.status}]`,
    )
    if (!c.clean) flagged.push(raw)
  }
  console.log(
    flagged.length === 0
      ? '→ Alle Rohwerte sauber geparst (kein Fallback, kein leer, kein Fehler).'
      : `→ ⚠ ${flagged.length} Rohwert(e) NICHT sauber: ${flagged.join(', ')}`,
  )

  // ── C) E-Mail-Bereinigung ──
  console.log('\n──── C) E-MAIL-BEREINIGUNG (vorher → nachher) ────')
  if (emailCleanups.length === 0) {
    console.log('Keine Bereinigung nötig.')
  } else {
    for (const c of emailCleanups) {
      console.log(
        `  KdNr ${c.kundennummer}  ${c.field}:  "${c.before}" → "${c.after}"  [${c.reason}]`,
      )
    }
  }
  console.log(`Summe bereinigter Felder: ${emailCleanups.length}`)

  // ── D) Qualitätscheck ──
  console.log('\n──── D) QUALITÄTSCHECK ────')
  const missingCompany = deduped.filter((r) => r.company_name === null)
  const missingUid = deduped.filter((r) => r.uid === null)
  const missingKdnr = deduped.filter((r) => r.kundennummer === null)
  const noCountry = deduped.filter((r) => r.country === null)
  const stillBadEmail = deduped.filter(
    (r) =>
      (r.billing_email !== null &&
        (!r.billing_email.includes('@') || /[\s()]/.test(r.billing_email))) ||
      (r.shipping_email !== null &&
        (!r.shipping_email.includes('@') || /[\s()]/.test(r.shipping_email))),
  )
  console.log(`Fehlende Firmennamen:              ${missingCompany.length}`)
  console.log(`Fehlende Kundennummer:             ${missingKdnr.length}`)
  console.log(`Fehlende UID (nur Info):           ${missingUid.length}`)
  console.log(`Land nicht auf ISO gemappt:        ${noCountry.length}`)
  console.log(
    `E-Mail nach Bereinigung noch auffällig: ${stillBadEmail.length}` +
      (conflicting.length ? '' : ''),
  )
  console.log(
    `Konflikt-Duplikate (abweichende Stammdaten): ${conflicting.length}`,
  )

  // ── E) Bestätigung ──
  console.log('\n──── E) BESTÄTIGUNG ────')
  console.log('Modus:', DRY_RUN ? 'DRY-RUN' : 'APPLY')
  console.log(
    'Idempotenz: .upsert(deduped, { onConflict: "org_id,kundennummer" }) — ' +
      `${deduped.length} Zeilen, leere Tabelle ⇒ alle INSERT, erneuter Lauf ⇒ UPDATE.`,
  )
  if (DRY_RUN) {
    console.log(
      '✅ 0 DB-Writes · nichts in Supabase geschrieben · nichts angewendet · nichts committet.',
    )
  }
}

// Ausführung: im Dry-Run NUR der Report; Upsert nur mit IMPORT_APPLY=1.
if (DRY_RUN) {
  main()
} else {
  const path = findSource()
  const deduped = dedupeRawRows(readDealerRows(path)).map((r) => mapRow(r))
  console.log(`APPLY-Modus: upserte ${deduped.length} eindeutige Händler …`)
  await applyUpsert(deduped)
}
