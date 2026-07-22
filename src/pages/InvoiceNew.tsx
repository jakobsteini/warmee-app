import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listDealers } from '../lib/dealers'
import { createFreeInvoice, createFreeDeliveryNote } from '../lib/invoices'
import { formatEUR, parsePrice } from '../lib/money'
import { applyVat, VAT_RATE_PERCENT } from '../lib/tax'
import type { Dealer } from '../types/dealer'
import { useT } from '../i18n'

/** Beleg-Modus für FALL B (ohne Order). */
type DocMode = 'invoice' | 'note' | 'both'

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
  const t = useT()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [dealerId, setDealerId] = useState('')
  const [mode, setMode] = useState<DocMode>('invoice')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const withInvoice = mode === 'invoice' || mode === 'both'
  const withNote = mode === 'note' || mode === 'both'

  useEffect(() => {
    ;(async () => {
      try {
        setDealers(await listDealers())
      } catch {
        setError(t('dealers.loadError'))
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
    const trimmedNotes = notes.trim() === '' ? null : notes.trim()
    try {
      // Freier Lieferschein zuerst (falls gewünscht) — Positionen ohne Preise.
      if (withNote) {
        const note = await createFreeDeliveryNote({
          dealer_id: dealerId,
          delivery_type: 'sale',
          items: validRows.map((r) => ({
            description: r.description.trim(),
            color: null,
            size: null,
            quantity: qtyOf(r),
          })),
          notes: trimmedNotes,
        })
        if (!withInvoice) {
          navigate(`/delivery-notes/${note.id}`)
          return
        }
      }
      if (withInvoice) {
        const invoice = await createFreeInvoice({
          dealer_id: dealerId,
          items: validRows.map((r) => ({
            description: r.description.trim(),
            quantity: qtyOf(r),
            unit_price: priceOf(r),
          })),
          notes: trimmedNotes,
        })
        navigate(`/invoices/${invoice.id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('invoices.createError'))
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
        {t('invoices.back')}
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">
          {t('invoiceNew.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('invoiceNew.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Händler */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm text-muted">{t('common.dealer')}</label>
        <select
          value={dealerId}
          onChange={(e) => setDealerId(e.target.value)}
          className={`${fieldClass} w-full max-w-md`}
        >
          <option value="">{t('invoiceNew.dealerPlaceholder')}</option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.kundennummer != null ? ` (${d.kundennummer})` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">{t('invoiceNew.dealerHint')}</p>
      </div>

      {/* Beleg-Modus (FALL B) */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm text-muted">{t('docNew.mode')}</label>
        <div className="flex flex-wrap gap-2">
          {(['both', 'note', 'invoice'] as DocMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                mode === m
                  ? 'bg-ink text-cream'
                  : 'border-[0.5px] border-line text-ink hover:bg-card'
              }`}
            >
              {t(`docNew.mode.${m}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Positionen */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm text-muted">{t('invoiceNew.positions')}</label>
          <button
            type="button"
            onClick={addRow}
            className="text-sm text-ink underline-offset-2 hover:underline"
          >
            {t('invoiceNew.addPosition')}
          </button>
        </div>

        <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t('invoiceNew.description')}</th>
                <th className="w-20 px-3 py-2 text-right font-medium">{t('common.quantity')}</th>
                {withInvoice && (
                  <>
                    <th className="w-32 px-3 py-2 text-right font-medium">
                      {t('common.unitPrice')}
                    </th>
                    <th className="w-32 px-3 py-2 text-right font-medium">{t('common.lineSum')}</th>
                  </>
                )}
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
                      placeholder={t('invoiceNew.descPlaceholder')}
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
                  {withInvoice && (
                    <>
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
                    </>
                  )}
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={rows.length === 1}
                      className="text-muted transition-colors hover:text-red-700 disabled:opacity-30"
                      aria-label={t('invoiceNew.removePosition')}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">{t('invoiceNew.priceHint')}</p>
      </div>

      {/* Summen (nur wenn eine Rechnung erzeugt wird) */}
      {withInvoice && (
        <div className="mb-6 ml-auto max-w-xs rounded-md border-[0.5px] border-line bg-surface px-5 py-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted">{t('invoiceNew.net')}</span>
            <span className="text-ink">{formatEUR(vat.net)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted">{t('common.vat', { percent: VAT_RATE_PERCENT })}</span>
            <span className="text-ink">{formatEUR(vat.tax)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t-[0.5px] border-line py-1 pt-2 font-medium">
            <span className="text-ink">{t('invoiceNew.gross')}</span>
            <span className="text-ink">{formatEUR(vat.gross)}</span>
          </div>
        </div>
      )}

      {/* Notiz */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm text-muted">
          {t('invoiceNew.notesOptional')}
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
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('invoiceNew.creating') : t(`docNew.submit.${mode}` as Parameters<typeof t>[0])}
        </button>
      </div>
    </div>
  )
}
