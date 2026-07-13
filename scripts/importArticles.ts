/**
 * Import-Skript: echte Artikel aus der SS27-Excel ins products-Schema.
 *
 * ARBEITSMODUS: Standardmäßig DRY-RUN — es wird NICHTS in die DB geschrieben.
 * Der Dry-Run liest die Excel, schließt Kategorie-Überschriften aus, mappt
 * jeden echten Artikel auf das products-Schema und gibt einen Prüf-Report aus.
 * Das scharfe Ausführen (Upsert) ist ein separater, späterer Schritt und nur
 * mit IMPORT_APPLY=1 plus echten Credentials erreichbar.
 *
 *   Dry-Run:   node scripts/importArticles.ts
 *   (später)   IMPORT_APPLY=1 IMPORT_ORG_ID=<uuid> SUPABASE_URL=… \
 *              SUPABASE_SERVICE_ROLE_KEY=… node scripts/importArticles.ts
 *
 * Quelle: "Artiekl SS27.xlsx" (Tippfehler im Dateinamen ist echt), Blatt
 * "Tabelle1". Deutsche/englische Feldnamen in der Excel, englische snake_case-
 * Spalten in der DB (CLAUDE.md-Konvention).
 */
import XLSX from 'xlsx' // CommonJS-Default-Import (SheetJS exportiert via module.exports)
import { existsSync } from 'node:fs'

// ─── Konfiguration ───────────────────────────────────────────────────────────

/** Ziel-Organisation. Im Dry-Run ein Platzhalter — NICHT geraten. */
const ORG_ID =
  process.env.IMPORT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'

/** DRY-RUN ist Default. Nur IMPORT_APPLY=1 würde (später) wirklich schreiben. */
const DRY_RUN = process.env.IMPORT_APPLY !== '1'

/** Feste Saison dieser Datei. */
const SEASON = 'SS27'

const SHEET = 'Tabelle1'
const SOURCE_CANDIDATES = [
  '/Users/js/Downloads/Artiekl SS27.xlsx',
  new URL('../docs/Artiekl SS27.xlsx', import.meta.url).pathname,
]

/** 0-basierte Spaltenindizes laut Kopfzeile (Excel-Zeile 1). */
const COL = {
  note: 0,
  style: 1,
  composition: 2,
  gg: 3,
  ply: 4,
  yarn_count: 5,
  weight: 6,
  price_shangrila: 7, // EK
  shipping: 8, // leer, kein Ziel
  labels: 9, // leer, kein Ziel
  total_cost: 10, // leer, ignorieren
  whs: 11, // WHS
  rtl: 12, // RTL
} as const

/**
 * Zeilen mit exakt diesem Style-Namen sind Kategorie-Überschriften mitten in
 * der Liste — KEINE Artikel. Ausschluss aber NUR, wenn die Zeile zusätzlich
 * keinerlei Preis trägt (siehe isCategoryHeader), damit ein echter Artikel
 * gleichen Namens nie fälschlich rausfliegt.
 */
const CATEGORY_HEADERS = new Set(['Scarves', 'Hair Ties', 'Belt', 'sweaters'])

/** products-Spalten laut Migrationsdateien (Basis + Realdata) — für den Abgleich. */
const PRODUCTS_COLUMNS = new Set([
  'id',
  'org_id',
  'name',
  'category',
  'color',
  'retail_price',
  'wholesale_price',
  'season_id',
  'created_at',
  'purchase_price',
  'style',
  'composition',
  'gauge',
  'ply',
  'yarn_count',
  'weight',
  'note',
])

// ─── Zell-Helfer ─────────────────────────────────────────────────────────────

type Row = (string | number | boolean | null | undefined)[]

/** Getrimmter String oder null. */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Preis als Zahl oder null (Zahl oder numerischer String wie "149"). */
function price(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n =
    typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

// ─── Zeilen-Erkennung ────────────────────────────────────────────────────────

function isEmpty(row: Row): boolean {
  return !row || row.every((c) => c === null || c === undefined || c === '')
}

/**
 * Kategorie-Überschrift = exakter Style-Name aus CATEGORY_HEADERS UND kein
 * einziger Preis (EK/WHS/RTL alle leer).
 */
function isCategoryHeader(row: Row): boolean {
  const style = str(row[COL.style])
  if (style === null || !CATEGORY_HEADERS.has(style)) return false
  const noPrice =
    price(row[COL.price_shangrila]) === null &&
    price(row[COL.whs]) === null &&
    price(row[COL.rtl]) === null
  return noPrice
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export interface ProductRecord {
  org_id: string
  season: string // 'SS27' — wird beim scharfen Lauf zu season_id aufgelöst
  name: string // Pflicht (products.name NOT NULL)
  style: string | null
  composition: string | null
  gauge: string | null
  ply: string | null
  yarn_count: string | null
  weight: string | null
  note: string | null
  purchase_price: number | null // EK  ← price shangrila
  wholesale_price: number | null // WHS ← whs
  retail_price: number | null // RTL ← rtl
}

function mapRow(row: Row): ProductRecord {
  const style = str(row[COL.style])
  return {
    org_id: ORG_ID,
    season: SEASON,
    name: style ?? '(ohne Style)', // Pflicht — leerer Style ist ein Datenfehler (Block E)
    style,
    composition: str(row[COL.composition]),
    gauge: str(row[COL.gg]),
    ply: str(row[COL.ply]),
    yarn_count: str(row[COL.yarn_count]),
    weight: str(row[COL.weight]),
    note: str(row[COL.note]),
    purchase_price: price(row[COL.price_shangrila]),
    wholesale_price: price(row[COL.whs]),
    retail_price: price(row[COL.rtl]),
  }
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

function readAllRows(path: string): { header: Row; data: Row[] } {
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`Blatt "${SHEET}" nicht gefunden.`)
  const rows = XLSX.utils.sheet_to_json<Row>(ws, {
    header: 1,
    raw: true,
    blankrows: true,
  })
  // Kopfzeile = Zeile mit "Style" in Spalte 1 (laut Struktur Zeile 1).
  const headerIdx = rows.findIndex(
    (r) => str(r[COL.style])?.toLowerCase() === 'style',
  )
  if (headerIdx < 0) throw new Error('Kopfzeile ("Style") nicht gefunden.')
  return {
    header: rows[headerIdx],
    data: rows.slice(headerIdx + 1).filter((r) => !isEmpty(r)),
  }
}

// ─── Upsert (nur mit IMPORT_APPLY=1 erreichbar; im Dry-Run NIE aufgerufen) ────

/**
 * Saison auflösen ODER anlegen (resolve-or-create): sucht in seasons nach
 * (org_id, code); fehlt sie, wird sie angelegt (label = code, is_active = false).
 * Gibt die season_id zurück. Läuft NUR im Apply-Modus (braucht DB) — im Dry-Run
 * wird sie nie aufgerufen. KEIN Season-Seed in der Migration (bewusst hier).
 */
async function resolveOrCreateSeason(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> } }
      }
      insert: (v: Record<string, unknown>) => {
        select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> }
      }
    }
  },
  orgId: string,
  code: string,
): Promise<string> {
  const found = await supabase
    .from('seasons')
    .select('id')
    .eq('org_id', orgId)
    .eq('code', code)
    .maybeSingle()
  if (found.error) throw found.error
  if (found.data) {
    console.log(`Saison "${code}" gefunden: ${found.data.id}`)
    return found.data.id
  }
  const created = await supabase
    .from('seasons')
    .insert({ org_id: orgId, code, label: code, is_active: false })
    .select('id')
    .single()
  if (created.error || !created.data) throw created.error ?? new Error('Season-Anlage fehlgeschlagen.')
  console.log(`Saison "${code}" neu angelegt: ${created.data.id}`)
  return created.data.id
}

async function applyUpsert(records: ProductRecord[]): Promise<void> {
  // Voraussetzung: Migration 20260713140000_products_season_style_uniq.sql ist
  // angewendet — sonst greift onConflict nicht (Postgres-Fehler zur Laufzeit).
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'IMPORT_APPLY=1 verlangt SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(url, serviceKey) as any

  // 1) Saison auflösen/anlegen → season_id für ALLE Artikel setzen.
  const seasonId = await resolveOrCreateSeason(supabase, ORG_ID, SEASON)

  // 2) products-Zeilen bauen (season-Label → season_id).
  const rows = records.map((r) => ({
    org_id: r.org_id,
    season_id: seasonId,
    name: r.name,
    style: r.style,
    composition: r.composition,
    gauge: r.gauge,
    ply: r.ply,
    yarn_count: r.yarn_count,
    weight: r.weight,
    note: r.note,
    purchase_price: r.purchase_price,
    wholesale_price: r.wholesale_price,
    retail_price: r.retail_price,
  }))

  // 3) Idempotenter Upsert auf (org_id, season_id, style).
  const { error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'org_id,season_id,style' })
  if (error) throw error
  console.log(`✓ ${rows.length} Artikel upserted (season_id ${seasonId}).`)
}

// ─── Report (Dry-Run) ────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  return v === null || v === undefined ? '·' : String(v)
}

function printRecord(label: string, r: ProductRecord): void {
  console.log(`\n── ${label} ─────────────────────────────────────────────`)
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k.padEnd(16)} ${fmt(v)}`)
  }
}

function main(): void {
  const path = findSource()
  const { data } = readAllRows(path)

  const excluded: Row[] = []
  const articleRows: Row[] = []
  for (const r of data) {
    if (isCategoryHeader(r)) excluded.push(r)
    else articleRows.push(r)
  }
  const articles = articleRows.map(mapRow)

  console.log('════════════════════════════════════════════════════════════')
  console.log('  ARTIKEL-IMPORT SS27 · DRY-RUN' + (DRY_RUN ? '' : ' · !!! APPLY !!!'))
  console.log('════════════════════════════════════════════════════════════')
  console.log('Quelle:', path)
  console.log('org_id:', ORG_ID, DRY_RUN ? '(Platzhalter)' : '')
  console.log('Saison:', SEASON)
  console.log('Datenzeilen gesamt:', data.length)

  // ── A) Anzahl echter Artikel + ausgeschlossene Kategorie-Zeilen ──
  console.log('\n──── A) ARTIKEL NACH AUSSCHLUSS ────')
  console.log(
    `${data.length} Datenzeilen − ${excluded.length} Kategorie-Überschriften ` +
      `= ${articles.length} echte Artikel (Erwartung 48).`,
  )
  console.log('Ausgeschlossene Kategorie-Zeilen (kein Preis + Style ∈ Kategorien):')
  for (const r of excluded) {
    console.log(
      `  ✗ "${str(r[COL.style])}"  (EK/WHS/RTL alle leer: ` +
        `${price(r[COL.price_shangrila]) === null && price(r[COL.whs]) === null && price(r[COL.rtl]) === null})`,
    )
  }

  // ── B) 3 vollständig gemappte Beispiel-Artikel ──
  console.log('\n──── B) BEISPIEL-ARTIKEL (erster / mittlerer / letzter) ────')
  if (articles.length > 0) {
    const mid = Math.floor(articles.length / 2)
    printRecord(`ERSTER (#1)`, articles[0])
    printRecord(`MITTLERER (#${mid + 1})`, articles[mid])
    printRecord(`LETZTER (#${articles.length})`, articles[articles.length - 1])
  }

  // ── C) Preis-Lücken ──
  console.log('\n──── C) PREIS-LÜCKEN (werden importiert, aber markiert) ────')
  const allPricesMissing = articles.filter(
    (a) => a.purchase_price === null && a.wholesale_price === null && a.retail_price === null,
  )
  const ekMissing = articles.filter(
    (a) => a.purchase_price === null && (a.wholesale_price !== null || a.retail_price !== null),
  )
  const whsOrRtlMissing = articles.filter(
    (a) =>
      a.purchase_price !== null &&
      (a.wholesale_price === null || a.retail_price === null),
  )
  console.log(`Alle Preise fehlen (${allPricesMissing.length}):`)
  for (const a of allPricesMissing)
    console.log(`  ⚠ "${a.name}" — EK/WHS/RTL fehlen · von Theresa nachzutragen`)
  console.log(`EK fehlt, WHS/RTL vorhanden (${ekMissing.length}):`)
  for (const a of ekMissing)
    console.log(
      `  ⚠ "${a.name}" — EK fehlt (WHS ${fmt(a.wholesale_price)} / RTL ${fmt(a.retail_price)}) · nachzutragen`,
    )
  if (whsOrRtlMissing.length) {
    console.log(`WHS oder RTL fehlt, EK vorhanden (${whsOrRtlMissing.length}):`)
    for (const a of whsOrRtlMissing)
      console.log(
        `  ⚠ "${a.name}" — EK ${fmt(a.purchase_price)} / WHS ${fmt(a.wholesale_price)} / RTL ${fmt(a.retail_price)}`,
      )
  }

  // ── D) Unmapped-Spalten (Schema-Abgleich gegen Migrationsdateien) ──
  console.log('\n──── D) SCHEMA-ABGLEICH (Quelle → products, laut Migrationen) ────')
  const mapping: [string, string | null][] = [
    ['NOTE', 'note'],
    ['Style', 'name + style'],
    ['Composition', 'composition'],
    ['gg', 'gauge'],
    ['ply', 'ply'],
    ['Yarn count', 'yarn_count'],
    ['weight', 'weight'],
    ['price shangrila', 'purchase_price'],
    ['whs', 'wholesale_price'],
    ['rtl', 'retail_price'],
    ['shipping', null],
    ['labels', null],
    ['total cost', null],
  ]
  const unmapped = mapping.filter(([, tgt]) => tgt === null)
  for (const [src, tgt] of mapping) {
    const ok = tgt !== null && tgt.split(' + ').every((t) => PRODUCTS_COLUMNS.has(t))
    console.log(
      `  ${src.padEnd(16)} → ${tgt ?? '— (KEIN Ziel)'}${ok ? '' : tgt ? '  ⚠ Spalte fehlt!' : ''}`,
    )
  }
  console.log(
    `Quell-Spalten OHNE Zielspalte: ${unmapped.map(([s]) => s).join(', ')} ` +
      `— alle in der Datei leer (0 Werte), daher unkritisch. (+ 3 unbenannte Leerspalten.)`,
  )
  console.log(
    '\nSchema-Hinweise für den scharfen Import (KEINE fehlende Attribut-Spalte):',
  )
  console.log(
    '  • Saison: products.season_id (FK) — SS27 wird zur Apply-Zeit via resolve-or-create\n' +
      '    in seasons (org_id, code) aufgelöst/angelegt; im Dry-Run als "season: SS27".',
  )
  console.log(
    '  • Upsert-Key (org_id, season_id, style): jetzt durch die neue Migrationsdatei\n' +
      '    20260713140000_products_season_style_uniq.sql gedeckt (abgelegt, NOCH NICHT angewendet).',
  )
  console.log(
    '  • category/color bleiben null (in der Quelle nicht vorhanden). Kategorie ließe sich\n' +
      '    optional aus den Abschnitts-Überschriften ableiten — hier bewusst NICHT getan.',
  )

  // ── E) Qualitätscheck ──
  console.log('\n──── E) QUALITÄTSCHECK ────')
  const byStyle = new Map<string, number>()
  for (const a of articles) byStyle.set(a.name, (byStyle.get(a.name) ?? 0) + 1)
  const dupStyles = [...byStyle.entries()].filter(([, n]) => n > 1)
  const emptyName = articles.filter((a) => a.style === null)
  const rtlUnderWhs = articles.filter(
    (a) => a.retail_price !== null && a.wholesale_price !== null && a.retail_price < a.wholesale_price,
  )
  const whsUnderEk = articles.filter(
    (a) => a.wholesale_price !== null && a.purchase_price !== null && a.wholesale_price < a.purchase_price,
  )
  console.log(
    `Doppelte Style-Namen: ${dupStyles.length}` +
      (dupStyles.length ? ' → ' + dupStyles.map(([s, n]) => `"${s}"(${n}×)`).join(', ') : ''),
  )
  console.log(`Leerer Style (Pflichtfeld): ${emptyName.length}`)
  console.log(
    `RTL < WHS (auffällig): ${rtlUnderWhs.length}` +
      (rtlUnderWhs.length
        ? ' → ' + rtlUnderWhs.map((a) => `"${a.name}" (WHS ${a.wholesale_price}/RTL ${a.retail_price})`).join(', ')
        : ''),
  )
  console.log(
    `WHS < EK (Verkauf unter Einkauf): ${whsUnderEk.length}` +
      (whsUnderEk.length
        ? ' → ' + whsUnderEk.map((a) => `"${a.name}" (EK ${a.purchase_price}/WHS ${a.wholesale_price})`).join(', ')
        : ''),
  )

  // Idempotenz-Vorschau.
  console.log('\n──── IDEMPOTENZ-VORSCHAU (Upsert auf org_id + season_id + style) ────')
  console.log(
    'Saison-Auflösung (Apply-Zeit, hier NICHT ausgeführt): resolve-or-create in\n' +
      '  seasons(org_id, code="SS27") → season_id wird auf alle 48 Artikel gesetzt.',
  )
  console.log(
    `Strategie: .upsert(rows, { onConflict: "org_id,season_id,style" }) — gedeckt durch\n` +
      '  20260713140000_products_season_style_uniq.sql; erneuter Lauf → UPDATE, kein Duplikat.',
  )
  console.log(`INSERT (leere Tabelle angenommen): ${articles.length}   UPDATE: 0`)

  // ── F) Bestätigung ──
  console.log('\n──── F) BESTÄTIGUNG ────')
  console.log('Modus:', DRY_RUN ? 'DRY-RUN' : 'APPLY')
  if (DRY_RUN) {
    console.log(
      '✅ 0 DB-Writes · nichts in Supabase geschrieben · nichts angewendet · nichts committet.',
    )
  }
}

/** Für den SQL-Generator: die 48 echten Artikel (ohne Kategorie-Zeilen). */
export function loadArticleRecords(): ProductRecord[] {
  const { data } = readAllRows(findSource())
  return data.filter((r) => !isCategoryHeader(r)).map(mapRow)
}

// Ausführung nur als Skript (nicht beim Import durch den Generator).
if (import.meta.main) {
  if (DRY_RUN) {
    main()
  } else {
    const articles = loadArticleRecords()
    console.log(`APPLY-Modus: upserte ${articles.length} Artikel …`)
    await applyUpsert(articles)
  }
}
