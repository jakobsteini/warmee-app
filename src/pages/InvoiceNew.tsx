import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listDealers } from '../lib/dealers'
import { createFreeInvoice } from '../lib/invoices'
import { formatEUR, parsePrice } from '../lib/money'
import { applyVat, VAT_RATE_PERCENT } from '../lib/tax'
import type { Dealer } from '../types/dealer'

/** Eine Positionszeile im Formular (Strings, damit Tippen flüssig bleibt). */
interface Row {
  description: string
  quantity: string
  unitPrice: string
}

const emptyRow = (): Row => ({ description: '', quantity: '1', unitPrice: '' })

/** Menge als ganze Zahl (Fallback 0). */
function qtyOf(row: Row): number {
  const n = Math.round(parsePrice(row.quantity) ?? 0)
  return n > 0 ? n : 0
}

/** Einzelpreis netto (Fallback 0). */
function priceOf(row: Row): number {
  return parsePrice(row.unitPrice) ?? 0
}

export default function InvoiceNew() {
  const navigate = useNavigate()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [dealerId, setDealerId] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setDealers(await listDealers())
      } catch {
        setError('Händler konnten nicht geladen werden.')
      }
    })()
  }, [])

  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + qtyOf(r) * priceOf(r), 0),
    [rows],
  )
  const vat = useMemo(() => applyVat(subtotal), [subtotal])

  const validRows = rows.filter(
    (r) => r.description.trim() !== '' && qtyOf(r) > 0,
  )
  const canSubmit = dealerId !== '' && validRows.length > 0 && !saving

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }
  function removeRow(idx: number) {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    )
  }

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const invoice = await createFreeInvoice({
        dealer_id: dealerId,
        items: validRows.map((r) => ({
          description: r.description.trim(),
          quantity: qtyOf(r),
          unit_price: priceOf(r),
        })),
        notes: notes.trim() === '' ? null : notes.trim(),
      })
      navigate(`/invoices/${invoice.id}`)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Rechnung konnte nicht erstellt werden.',
      )
      setSaving(false)
    }
  }

  const fieldClass =
    'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => navigate('/invoices')}
        className="mb-4 text-sm text-muted transition-colors hover:text-ink"
      >
        ← Zurück zu den Rechnungen
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">
          Freie Rechnung erstellen
        </h1>
        <p className="mt-1 text-sm text-muted">
          Rechnung ohne zugrundeliegende Lieferung. Nummer, USt und Skonto werden
          wie bei jeder Rechnung automatisch vergeben.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Händler */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm text-muted">Händler</label>
        <select
          value={dealerId}
          onChange={(e) => setDealerId(e.target.value)}
          className={`${fieldClass} w-full max-w-md`}
        >
          <option value="">Bitte wählen…</option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.kundennummer != null ? ` (${d.kundennummer})` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Adresse und Zahlungskonditionen werden vom Händler übernommen.
        </p>
      </div>

      {/* Positionen */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm text-muted">Positionen</label>
          <button
            type="button"
            onClick={addRow}
            className="text-sm text-ink underline-offset-2 hover:underline"
          >
            + Position
          </button>
        </div>

        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Bezeichnung</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Menge</th>
                <th className="w-32 px-3 py-2 text-right font-medium">
                  Einzelpreis
                </th>
                <th className="w-32 px-3 py-2 text-right font-medium">Summe</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t-[0.5px] border-line bg-surface">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={r.description}
                      onChange={(e) =>
                        updateRow(idx, { description: e.target.value })
                      }
                      placeholder="z. B. Beratung / Musterversand"
                      className={`${fieldClass} w-full`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.quantity}
                      onChange={(e) =>
                        updateRow(idx, { quantity: e.target.value })
                      }
                      className={`${fieldClass} w-full text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.unitPrice}
                      onChange={(e) =>
                        updateRow(idx, { unitPrice: e.target.value })
                      }
                      placeholder="0,00"
                      className={`${fieldClass} w-full text-right`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-ink">
                    {formatEUR(qtyOf(r) * priceOf(r))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={rows.length === 1}
                      className="text-muted transition-colors hover:text-red-700 disabled:opacity-30"
                      aria-label="Position entfernen"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">
          Einzelpreis netto. Dezimalkomma erlaubt.
        </p>
      </div>

      {/* Summen */}
      <div className="mb-6 ml-auto max-w-xs rounded-md border-[0.5px] border-line bg-surface px-5 py-4 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-muted">Netto</span>
          <span className="text-ink">{formatEUR(vat.net)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-muted">USt ({VAT_RATE_PERCENT} %)</span>
          <span className="text-ink">{formatEUR(vat.tax)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t-[0.5px] border-line py-1 pt-2 font-medium">
          <span className="text-ink">Brutto</span>
          <span className="text-ink">{formatEUR(vat.gross)}</span>
        </div>
      </div>

      {/* Notiz */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm text-muted">
          Notiz (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${fieldClass} w-full`}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Erstellt…' : 'Rechnung erstellen'}
        </button>
      </div>
    </div>
  )
}
