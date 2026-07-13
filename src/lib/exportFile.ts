// ============================================================================
// Daten-Export als XLSX und CSV. Rein clientseitig aus bereits geladenen,
// org-scoped Daten — kein DB-Zugriff hier. XLSX über SheetJS (bereits im Repo),
// dynamisch importiert, damit die Lib nur beim tatsächlichen Export geladen wird.
// ============================================================================

/** Eine Export-Spalte: Überschrift + Wert-Getter. Zahlen bleiben Zahlen. */
export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null
  /** Optionale feste Spaltenbreite (Zeichen) für XLSX. */
  width?: number
}

/** numeric/number/null robust zu number (oder null). */
export function numify(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isNaN(n) ? null : n
}

/** ISO-Datum → TT.MM.JJJJ (leer bei null/ungültig). */
export function formatDateDE(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

/** Heutiges Datum als YYYY-MM-DD für sprechende Dateinamen. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Blob als Datei-Download anstoßen. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── XLSX ───────────────────────────────────────────────────────────────────

/**
 * Datensatz als Excel-Datei herunterladen. Beträge landen als echte Zahlen,
 * Datumsangaben als TT.MM.JJJJ-Text (siehe formatDateDE beim Spalten-Getter).
 * Dateiname: `<base>_<YYYY-MM-DD>.xlsx`.
 */
export async function downloadXlsx<T>(
  filenameBase: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<void> {
  const XLSX = await import('xlsx')

  const header = columns.map((c) => c.header)
  const body = rows.map((r) => columns.map((c) => c.value(r) ?? ''))
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])

  // Spaltenbreiten aus Überschrift + Inhalt (begrenzt), oder feste Vorgabe.
  ws['!cols'] = columns.map((c) => {
    if (c.width) return { wch: c.width }
    const dataMax = rows.reduce((m, r) => {
      const v = c.value(r)
      return Math.max(m, v == null ? 0 : String(v).length)
    }, 0)
    return { wch: clamp(Math.max(c.header.length, dataMax) + 2, 8, 48) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${filenameBase}_${todayStamp()}.xlsx`)
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/** Eine Zelle CSV-sicher machen (Semikolon-Trenner, Zahlen mit Dezimal-Komma). */
function csvCell(v: string | number | null): string {
  if (v === null) return ''
  if (typeof v === 'number') {
    // Echte Zahl, Dezimal-Komma, kein Tausender-Trenner, kein €.
    return String(v).replace('.', ',')
  }
  // Text: quoten, wenn Trenner/Anführungszeichen/Zeilenumbruch enthalten.
  if (/[";\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/**
 * Datensatz als CSV herunterladen: UTF-8 mit BOM (Umlaute in Excel korrekt),
 * Semikolon als Trenner (deutsches Excel), Dezimal-Komma bei Zahlen.
 * Dateiname: `<base>_<YYYY-MM-DD>.csv`.
 */
export function downloadCsv<T>(
  filenameBase: string,
  columns: ExportColumn<T>[],
  rows: T[],
): void {
  const lines: string[] = []
  lines.push(columns.map((c) => csvCell(c.header)).join(';'))
  for (const r of rows) {
    lines.push(columns.map((c) => csvCell(c.value(r))).join(';'))
  }
  // \uFEFF = BOM, \r\n = Excel-freundliche Zeilenenden.
  const content = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${filenameBase}_${todayStamp()}.csv`)
}
