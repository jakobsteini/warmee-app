/**
 * Import-Skript: Nepal-Produktionsbestellung "3. Order FW26" (Produzent
 * Shangri-La) ins production_orders/production_order_items-Schema.
 *
 * ARBEITSMODUS: Standardmäßig DRY-RUN — es wird NICHTS in die DB geschrieben.
 * Der Dry-Run liest die Excel, kategorisiert alle Zeilen, mappt die echten
 * Positionen und gibt einen Prüf-Report aus. Der scharfe Lauf ist ein
 * separater, späterer Schritt (IMPORT_APPLY=1 + Credentials) und setzt eine
 * noch fehlende Schema-Migration voraus (siehe Report / applyUpsert).
 *
 *   Dry-Run:   node scripts/importProductionOrder.ts
 *
 * Quelle: "3rdOrder_FW26.xlsx", Blatt "Tabelle1". Zeile 1 = Titel
 * "SHANGRILA UNI" (Produzent Shangri-La, Nepal), Zeile 2 = Kopf, ab Zeile 3
 * Daten (inkl. Leerzeilen, Zwischensummen, wiederholten Köpfen usw.).
 */
import XLSX from 'xlsx' // CommonJS-Default-Import (SheetJS exportiert via module.exports)
import { existsSync } from 'node:fs'

// ─── Konfiguration ───────────────────────────────────────────────────────────

const ORG_ID =
  process.env.IMPORT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'
const DRY_RUN = process.env.IMPORT_APPLY !== '1'

/** Produzent dieser Datei (resolve-or-create in producers). */
const PRODUCER = { name: 'Shangri-La', country: 'NP' } // NP = Nepal
/** Saison dieser Order (resolve-or-create in seasons, NICHT SS27). */
const SEASON = 'FW26'
/** Bezeichnung der Produktionsbestellung (production_orders.notes). */
const ORDER_LABEL = '3. Order FW26'

const SHEET = 'Tabelle1'
const SOURCE_CANDIDATES = [
  '/Users/js/Downloads/3rdOrder_FW26.xlsx',
  new URL('../docs/3rdOrder_FW26.xlsx', import.meta.url).pathname,
]
/** SS27-Katalog als Proxy für products.style (kein DB-Zugriff im Dry-Run). */
const SS27_CANDIDATES = [
  '/Users/js/Downloads/Artiekl SS27.xlsx',
  new URL('../docs/Artiekl SS27.xlsx', import.meta.url).pathname,
]

/** 0-basierte Spaltenindizes laut Kopfzeile (Excel-Zeile 2). */
const COL = {
  pos: 0,
  modell: 1,
  modell_description: 2,
  quality: 3,
  color: 4,
  color_description: 5,
  group: 6,
  uni: 7,
  price_per_piece: 15,
  quantity: 16,
  whole_price: 17,
  eur: 18,
} as const

// ─── Helfer ──────────────────────────────────────────────────────────────────

type Row = (string | number | boolean | null | undefined)[]

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function isNumericCell(v: unknown): boolean {
  if (typeof v === 'number') return true
  if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v.replace(',', '.')))
  return false
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Zeilen-Kategorisierung ──────────────────────────────────────────────────

type Category =
  | 'leer'
  | 'wiederholte Kopfzeile'
  | 'Zwischensumme'
  | 'Zahlen-Footer'
  | 'Sektions-Marker'
  | 'echte Position'
  | 'REST (unklar)'

function classify(row: Row): Category {
  if (!row || row.every((c) => c === null || c === undefined || c === '')) return 'leer'
  const m = str(row[COL.modell])
  const d = str(row[COL.modell_description])
  const qFilled = row[COL.quantity] !== null && row[COL.quantity] !== undefined && row[COL.quantity] !== ''
  const wFilled = row[COL.whole_price] !== null && row[COL.whole_price] !== undefined && row[COL.whole_price] !== ''

  // Wiederholte Kopfzeile mitten in der Datei.
  if (m?.toLowerCase() === 'modell' || d?.toLowerCase() === 'modell description')
    return 'wiederholte Kopfzeile'
  // Zwischensumme: Whole Price gefüllt, aber kein Modell + keine Description.
  if (wFilled && m === null && d === null) return 'Zwischensumme'
  // Zahlen-Footer: Modell ist eine nackte Zahl ohne Description.
  if (m !== null && isNumericCell(row[COL.modell]) && d === null) return 'Zahlen-Footer'
  // Echte Position: Description UND Quantity gefüllt.
  if (d !== null && qFilled) return 'echte Position'
  // Sektions-Marker: kein Modell/Description/Quantity (aber sonst was, z. B. Titel).
  if (d === null && !qFilled) return 'Sektions-Marker'
  return 'REST (unklar)'
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export interface PositionRecord {
  modell: string | null
  modell_description: string | null
  quality: string | null
  color: string | null
  color_description: string | null
  group: string | null
  price_per_piece: number | null
  quantity: number | null // → total_quantity
  whole_price: number | null
  product_id: string | null // nur bei exaktem style-Treffer; Dry-Run: null
}

function mapPosition(row: Row): PositionRecord {
  return {
    modell: str(row[COL.modell]),
    modell_description: str(row[COL.modell_description]),
    quality: str(row[COL.quality]),
    color: str(row[COL.color]),
    color_description: str(row[COL.color_description]),
    group: str(row[COL.group]),
    price_per_piece: numOrNull(row[COL.price_per_piece]),
    quantity: numOrNull(row[COL.quantity]),
    whole_price: numOrNull(row[COL.whole_price]),
    product_id: null,
  }
}

// ─── Einlesen ────────────────────────────────────────────────────────────────

function find(cands: string[]): string {
  for (const p of cands) if (p && existsSync(p)) return p
  throw new Error('Datei nicht gefunden:\n  ' + cands.join('\n  '))
}

function readData(path: string): Row[] {
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`Blatt "${SHEET}" nicht gefunden.`)
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, blankrows: true })
  const headerIdx = rows.findIndex((r) => str(r[COL.modell])?.toLowerCase() === 'modell')
  if (headerIdx < 0) throw new Error('Kopfzeile ("Modell") nicht gefunden.')
  return rows.slice(headerIdx + 1)
}

/** SS27-Styles als Proxy für products.style (Set, lowercase getrimmt). */
function loadSs27Styles(): Set<string> {
  const CATS = new Set(['scarves', 'hair ties', 'belt', 'sweaters'])
  const wb = XLSX.readFile(find(SS27_CANDIDATES))
  const ws = wb.Sheets['Tabelle1']
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, blankrows: true })
  const hIdx = rows.findIndex((r) => str(r[1])?.toLowerCase() === 'style')
  const styles = new Set<string>()
  for (const r of rows.slice(hIdx + 1)) {
    const style = str(r[1])
    if (style && !CATS.has(style.toLowerCase())) styles.add(style.toLowerCase())
  }
  return styles
}

// ─── Upsert (nur mit IMPORT_APPLY=1; im Dry-Run NIE erreicht) ────────────────

async function applyUpsert(): Promise<void> {
  // Diese Anlage setzt eine noch NICHT vorhandene Schema-Migration voraus:
  //  • production_order_items.product_id auf NULLABLE ändern
  //  • Spalten ergänzen: modell, modell_description, quality, color_description,
  //    group_name, price_per_piece, whole_price (color + total_quantity bestehen)
  //  • production_orders hat kein Bezeichnungsfeld → notes nutzen
  // Erst danach kann der scharfe Lauf laufen. Siehe Dry-Run-Report.
  throw new Error(
    'APPLY noch nicht möglich: production_order_items braucht zuerst eine ' +
      'Schema-Migration (product_id nullable + Positions-Spalten). Details im Report.',
  )
}

// ─── Report (Dry-Run) ────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  return v === null || v === undefined ? '·' : String(v)
}
function printPos(label: string, p: PositionRecord): void {
  console.log(`\n── ${label} ─────────────────────────────────────────────`)
  for (const [k, v] of Object.entries(p)) console.log(`  ${k.padEnd(19)} ${fmt(v)}`)
}

function main(): void {
  const path = find(SOURCE_CANDIDATES)
  const data = readData(path)

  const buckets = new Map<Category, Row[]>()
  for (const r of data) {
    const c = classify(r)
    ;(buckets.get(c) ?? buckets.set(c, []).get(c)!).push(r)
  }
  const positions = (buckets.get('echte Position') ?? []).map(mapPosition)

  console.log('════════════════════════════════════════════════════════════')
  console.log('  PRODUKTIONSBESTELLUNG-IMPORT · DRY-RUN' + (DRY_RUN ? '' : ' · !!! APPLY !!!'))
  console.log('════════════════════════════════════════════════════════════')
  console.log('Quelle:', path)
  console.log('Produzent:', PRODUCER.name, `(${PRODUCER.country} = Nepal)`)
  console.log('Saison:', SEASON, '· Order:', ORDER_LABEL)
  console.log('org_id:', ORG_ID, DRY_RUN ? '(Platzhalter)' : '')

  // ── A) Kategorisierung ──
  console.log('\n──── A) ZEILEN-KATEGORISIERUNG ────')
  const order: Category[] = [
    'echte Position',
    'leer',
    'Zwischensumme',
    'Zahlen-Footer',
    'wiederholte Kopfzeile',
    'Sektions-Marker',
    'REST (unklar)',
  ]
  let total = 0
  for (const c of order) {
    const n = buckets.get(c)?.length ?? 0
    total += n
    console.log(`  ${c.padEnd(24)} ${n}`)
  }
  console.log(`  ${'—'.repeat(24)} ${'—'}`)
  console.log(`  ${'Datenzeilen gesamt'.padEnd(24)} ${total}`)
  console.log(`→ Echte Positionen: ${positions.length} (Erwartung ~104)`)
  // Sonderzeilen kurz zeigen (zur Bestätigung).
  for (const c of ['Zwischensumme', 'Zahlen-Footer', 'Sektions-Marker'] as Category[]) {
    const ex = (buckets.get(c) ?? []).map((r) =>
      r.map((v, i) => (v !== null && v !== undefined && v !== '' ? `${i}:${v}` : null)).filter(Boolean).slice(0, 4).join(' '),
    )
    console.log(`   ${c}: ${ex.map((e) => `[${e}]`).join('  ')}`)
  }

  // ── B) Beispiel-Positionen ──
  console.log('\n──── B) BEISPIEL-POSITIONEN (erste / mittlere / letzte) ────')
  if (positions.length) {
    const mid = Math.floor(positions.length / 2)
    printPos(`ERSTE (#1)`, positions[0])
    printPos(`MITTLERE (#${mid + 1})`, positions[mid])
    printPos(`LETZTE (#${positions.length})`, positions[positions.length - 1])
  }

  // ── Anlage-Logik (Apply-Zeit, hier nur beschrieben) ──
  console.log('\n──── ANLAGE-LOGIK (Apply-Zeit — im Dry-Run NICHT ausgeführt) ────')
  console.log(
    `  1) Produzent "${PRODUCER.name}" resolve-or-create in producers ` +
      `(org_id, name; country=${PRODUCER.country}).`,
  )
  console.log(
    '     Backfill: bestehende production_orders mit producer_id = NULL würden ' +
      'auf diesen Produzenten gesetzt.',
  )
  console.log(`  2) Saison "${SEASON}" resolve-or-create in seasons (org_id, code) — NICHT SS27.`)
  console.log(
    `  3) EIN production_orders-Header (season_id=FW26, producer_id=Shangri-La, ` +
      `notes="${ORDER_LABEL}"), dann ${positions.length} production_order_items.`,
  )
  console.log('\n  ⚠ SCHEMA-BLOCKER (Nachtrags-Migration nötig, BEVOR scharf importiert wird):')
  console.log('     • production_order_items.product_id ist aktuell NOT NULL → auf NULLABLE ändern')
  console.log('       (Positionen ohne Katalog-Treffer sollen product_id = NULL haben).')
  console.log('     • Fehlende Positions-Spalten ergänzen: modell, modell_description, quality,')
  console.log('       color_description, group_name, price_per_piece, whole_price')
  console.log('       (vorhanden: color, total_quantity ← Quantity).')
  console.log('     • production_orders hat kein Bezeichnungsfeld → notes für "3. Order FW26".')

  // ── C) Artikel-Join-Coverage ──
  console.log('\n──── C) ARTIKEL-JOIN-COVERAGE (Modell Description ↔ products.style) ────')
  const catalog = loadSs27Styles()
  const descs = [...new Set(positions.map((p) => p.modell_description).filter((d): d is string => d !== null))]
  const hit = descs.filter((d) => catalog.has(d.toLowerCase()))
  const miss = descs.filter((d) => !catalog.has(d.toLowerCase()))
  console.log(`Vergleichsbasis: ${catalog.size} SS27-Styles (Proxy für products.style, keine DB im Dry-Run).`)
  console.log(`Eindeutige Modell-Descriptions: ${descs.length}`)
  console.log(`  EXAKTE Treffer (→ product_id gesetzt):   ${hit.length}${hit.length ? ' → ' + hit.join(', ') : ''}`)
  console.log(`  KEINE Treffer (→ product_id = NULL):     ${miss.length}`)
  for (const d of miss) console.log(`     · "${d}"`)
  console.log(
    'Bestätigt: Nicht-Treffer werden mit product_id = NULL importiert — KEINE Phantom-Artikel. ' +
      '(FW26-Order vs. SS27-Katalog ⇒ kaum Treffer erwartet.)',
  )

  // ── D) Summen-Gegencheck ──
  console.log('\n──── D) SUMMEN-GEGENCHECK ────')
  const sumQty = positions.reduce((s, p) => s + (p.quantity ?? 0), 0)
  const sumWhole = round2(positions.reduce((s, p) => s + (p.whole_price ?? 0), 0))
  const subs = buckets.get('Zwischensumme') ?? []
  const subQty = subs.reduce((s, r) => s + (numOrNull(r[COL.quantity]) ?? 0), 0)
  const subWhole = round2(subs.reduce((s, r) => s + (numOrNull(r[COL.whole_price]) ?? 0), 0))
  const footers = buckets.get('Zahlen-Footer') ?? []
  const footerQty = numOrNull(footers.find((r) => str(r[COL.pos])?.toLowerCase().includes('quantity'))?.[COL.modell])
  const footerAmt = numOrNull(footers.find((r) => str(r[COL.pos])?.toLowerCase().includes('amount'))?.[COL.modell])
  console.log(`Positionen:    Σ Quantity = ${sumQty}      Σ Whole Price = ${sumWhole}`)
  console.log(`Zwischensummen (${subs.length}): Σ Quantity = ${subQty}      Σ Whole Price = ${subWhole}`)
  console.log(`Footer:        Total Quantity = ${fmt(footerQty)}   Total Amount = ${fmt(footerAmt)}`)
  const qtyOk = sumQty === subQty && (footerQty === null || sumQty === footerQty)
  const amtOk = Math.abs(sumWhole - subWhole) < 0.05 && (footerAmt === null || Math.abs(sumWhole - footerAmt) < 0.05)
  console.log(`→ Menge plausibel: ${qtyOk ? 'JA ✓' : 'NEIN ⚠'}   ·   Betrag plausibel: ${amtOk ? 'JA ✓' : 'NEIN ⚠'}`)

  // ── E) Bestätigung ──
  console.log('\n──── E) BESTÄTIGUNG ────')
  console.log('Modus:', DRY_RUN ? 'DRY-RUN' : 'APPLY')
  if (DRY_RUN)
    console.log('✅ 0 DB-Writes · nichts in Supabase geschrieben · nichts angewendet · nichts committet.')
}

/** Für den SQL-Generator: die 104 echten Positionen. */
export function loadPositions(): PositionRecord[] {
  const data = readData(find(SOURCE_CANDIDATES))
  return data.filter((r) => classify(r) === 'echte Position').map(mapPosition)
}

// Ausführung nur als Skript (nicht beim Import durch den Generator).
if (import.meta.main) {
  if (DRY_RUN) {
    main()
  } else {
    await applyUpsert()
  }
}
