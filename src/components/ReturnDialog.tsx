import { useState, type FormEvent } from 'react'
import { formatEUR } from '../lib/money'
import { returnTotal, canReturnQuantity } from '../lib/returnsCalc'
import { VAT_RATE_PERCENT } from '../lib/tax'
import type {
  ReturnableLine,
  CreateReturnLine,
  DeliveryNoteReturnableLine,
  CreateDeliveryNoteReturnLine,
} from '../types/return'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Heute als ISO-Kurzdatum (YYYY-MM-DD). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface CreateReturnPayload {
  lines: CreateReturnLine[]
  return_date: string
  reason: string | null
}

/**
 * Retoure erfassen: je Rechnungsposition mit Restmenge eine Retouren-Menge
 * eingeben (harte Prüfung über returnsCalc), plus Rückgabedatum und optionalen
 * Grund. Positionen ohne Restmenge sind ausgegraut und nicht auswählbar. Die
 * Gutschrift-Summe wird live berechnet. Kein PDF, kein Nummernkreis.
 */
export function ReturnCaptureDialog({
  invoiceNumber,
  lines,
  onConfirm,
  onClose,
}: {
  invoiceNumber: string
  lines: ReturnableLine[]
  onConfirm: (payload: CreateReturnPayload) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [qty, setQty] = useState<Record<string, string>>({})
  const [returnDate, setReturnDate] = useState(todayIso())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Eingegebene Menge einer Position als (evtl. ungültige) Zahl. */
  function enteredQty(id: string): number {
    return Number((qty[id] ?? '').trim())
  }

  /** Zeilen mit gültiger, positiver Ganzzahl-Menge — für die Live-Summe. */
  const enteredLines = lines
    .filter((l) => {
      const n = enteredQty(l.invoice_item_id)
      return Number.isInteger(n) && n >= 1
    })
    .map((l) => ({ quantity: enteredQty(l.invoice_item_id), unit_price: l.unit_price }))

  const amounts = returnTotal(enteredLines)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const out: CreateReturnLine[] = []
    for (const l of lines) {
      const raw = (qty[l.invoice_item_id] ?? '').trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!canReturnQuantity(l.remaining_quantity, n)) {
        setError(
          t('returns.qtyExceeds', {
            label: l.description,
            remaining: l.remaining_quantity,
          }),
        )
        return
      }
      out.push({ invoice_item_id: l.invoice_item_id, quantity: n })
    }
    if (out.length === 0) {
      setError(t('returns.selectAtLeastOne'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm({
        lines: out,
        return_date: returnDate,
        reason: reason.trim() || null,
      })
    } catch {
      setError(t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="text-lg font-medium text-ink">{t('returns.dialogTitle')}</h2>
        <p className="mb-4 text-sm text-muted">
          {t('returns.forInvoice', { number: invoiceNumber })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('common.article')}</th>
                  <th className="px-3 py-2 font-medium">{t('common.color')}</th>
                  <th className="px-3 py-2 font-medium">{t('common.size')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('common.unitPrice')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('returns.colRemaining')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('returns.colReturn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const returnable = l.remaining_quantity > 0
                  return (
                    <tr
                      key={l.invoice_item_id}
                      className={`border-t-[0.5px] border-line ${
                        returnable ? 'bg-surface text-ink' : 'bg-card text-muted'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">{l.description}</td>
                      <td className="px-3 py-2">{l.color ?? '—'}</td>
                      <td className="px-3 py-2">{l.size ?? '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {formatEUR(l.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {returnable ? (
                          l.remaining_quantity
                        ) : (
                          <span className="text-xs">{t('returns.noneReturnable')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {returnable && (
                          <input
                            type="number"
                            min={1}
                            max={l.remaining_quantity}
                            step={1}
                            value={qty[l.invoice_item_id] ?? ''}
                            onChange={(e) =>
                              setQty((q) => ({
                                ...q,
                                [l.invoice_item_id]: e.target.value,
                              }))
                            }
                            className={`${inputClass} w-20 text-right`}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t('returns.date')}</span>
              <input
                type="date"
                value={returnDate}
                max={todayIso()}
                onChange={(e) => setReturnDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <dl className="min-w-[13rem] space-y-0.5 text-sm tabular-nums">
              <div className="flex justify-between gap-6">
                <dt className="text-muted">{t('returns.net')}</dt>
                <dd className="text-ink">{formatEUR(amounts.net)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-muted">
                  {t('common.vat', { percent: VAT_RATE_PERCENT })}
                </dt>
                <dd className="text-ink">{formatEUR(amounts.tax)}</dd>
              </div>
              <div className="flex justify-between gap-6 border-t-[0.5px] border-line pt-0.5">
                <dt className="font-medium text-ink">{t('returns.gross')}</dt>
                <dd className="font-medium text-ink">{formatEUR(amounts.gross)}</dd>
              </div>
            </dl>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('returns.reason')}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={t('returns.reasonPlaceholder')}
              className={`${inputClass} resize-none`}
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('returns.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface CreateLsReturnPayload {
  lines: CreateDeliveryNoteReturnLine[]
  return_date: string
  reason: string | null
}

/**
 * Lieferschein-Rücksendung erfassen (Kommission Variante 2): je LS-Position mit
 * Restmenge eine Rücksende-Menge eingeben (harte Prüfung über returnsCalc), plus
 * Datum und optionalen Grund. REINE MENGEN — keine Beträge (Ware nie fakturiert).
 * Der Lieferschein bleibt unverändert.
 */
export function DeliveryNoteReturnCaptureDialog({
  noteNumber,
  lines,
  onConfirm,
  onClose,
}: {
  noteNumber: string
  lines: DeliveryNoteReturnableLine[]
  onConfirm: (payload: CreateLsReturnPayload) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [qty, setQty] = useState<Record<string, string>>({})
  const [returnDate, setReturnDate] = useState(todayIso())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const out: CreateDeliveryNoteReturnLine[] = []
    for (const l of lines) {
      const raw = (qty[l.delivery_note_item_id] ?? '').trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!canReturnQuantity(l.remaining_quantity, n)) {
        setError(
          t('returns.qtyExceeds', {
            label: l.description,
            remaining: l.remaining_quantity,
          }),
        )
        return
      }
      out.push({ delivery_note_item_id: l.delivery_note_item_id, quantity: n })
    }
    if (out.length === 0) {
      setError(t('returns.selectAtLeastOne'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm({ lines: out, return_date: returnDate, reason: reason.trim() || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="text-lg font-medium text-ink">{t('lsReturns.dialogTitle')}</h2>
        <p className="mb-4 text-sm text-muted">
          {t('lsReturns.forNote', { number: noteNumber })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-md border-[0.5px] border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('common.article')}</th>
                  <th className="px-3 py-2 font-medium">{t('common.color')}</th>
                  <th className="px-3 py-2 font-medium">{t('common.size')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('returns.colRemaining')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('lsReturns.colReturn')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const returnable = l.remaining_quantity > 0
                  return (
                    <tr
                      key={l.delivery_note_item_id}
                      className={`border-t-[0.5px] border-line ${
                        returnable ? 'bg-surface text-ink' : 'bg-card text-muted'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">{l.description}</td>
                      <td className="px-3 py-2">{l.color ?? '—'}</td>
                      <td className="px-3 py-2">{l.size ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {returnable ? (
                          l.remaining_quantity
                        ) : (
                          <span className="text-xs">{t('returns.noneReturnable')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {returnable && (
                          <input
                            type="number"
                            min={1}
                            max={l.remaining_quantity}
                            step={1}
                            value={qty[l.delivery_note_item_id] ?? ''}
                            onChange={(e) =>
                              setQty((q) => ({ ...q, [l.delivery_note_item_id]: e.target.value }))
                            }
                            className={`${inputClass} w-20 text-right`}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('returns.date')}</span>
            <input
              type="date"
              value={returnDate}
              max={todayIso()}
              onChange={(e) => setReturnDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('returns.reason')}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={t('returns.reasonPlaceholder')}
              className={`${inputClass} resize-none`}
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('lsReturns.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Retoure stornieren mit Pflichtfeld Grund. Kein Löschen — der Vorgang bleibt in
 * der Historie, zählt danach nicht mehr zur retournierten Menge/Gutschrift.
 */
export function CancelReturnDialog({
  amount,
  onConfirm,
  onClose,
}: {
  amount: number | string
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError(t('returns.cancelReasonRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(trimmed)
    } catch {
      setError(t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">
          {t('returns.cancelTitle')}
        </h2>
        <p className="mb-4 text-sm text-muted">
          {formatEUR(amount)} · {t('returns.cancelHint')}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('returns.cancelReason')}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('returns.cancelConfirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
