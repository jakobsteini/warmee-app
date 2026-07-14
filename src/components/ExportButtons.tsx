import { useState } from 'react'
import { downloadCsv, downloadXlsx, type ExportColumn } from '../lib/exportFile'
import { useT } from '../i18n'

/**
 * Zwei Download-Buttons („Als Excel" / „Als CSV") für einen Datensatz. Exportiert
 * genau die übergebenen `rows` — also den bereits gefilterten Stand der Liste.
 * Bei leerer Liste deaktiviert.
 */
export default function ExportButtons<T>({
  filenameBase,
  sheetName,
  columns,
  rows,
}: {
  filenameBase: string
  sheetName: string
  columns: ExportColumn<T>[]
  rows: T[]
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = rows.length === 0

  async function handleXlsx() {
    setBusy(true)
    setError(null)
    try {
      await downloadXlsx(filenameBase, sheetName, columns, rows)
    } catch {
      setError(t('export.xlsxError'))
    } finally {
      setBusy(false)
    }
  }

  function handleCsv() {
    setError(null)
    try {
      downloadCsv(filenameBase, columns, rows)
    } catch {
      setError(t('export.csvError'))
    }
  }

  const btnClass =
    'rounded-md border-[0.5px] border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50'

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleXlsx}
          disabled={disabled || busy}
          className={btnClass}
        >
          {busy ? t('export.busy') : t('export.xlsx')}
        </button>
        <button
          type="button"
          onClick={handleCsv}
          disabled={disabled}
          className={btnClass}
        >
          {t('export.csv')}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
