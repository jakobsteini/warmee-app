import { useState, type FormEvent } from 'react'
import { formatEUR } from '../lib/money'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Heute als ISO-Kurzdatum (YYYY-MM-DD) für das Default-Zahlungsdatum. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Dialog zum Erfassen eines Zahlungseingangs: Zahlungsdatum (Default heute) und
 * Betrag (Default = offener Bruttobetrag). Wird von der Rechnungs-Detailansicht
 * und der Offene-Posten-Liste gemeinsam genutzt.
 *
 * Bei Erfolg schließt der Aufrufer den Dialog (Komponente wird ausgehängt);
 * Fehler werden inline gezeigt und der Dialog bleibt offen.
 */
export default function MarkPaidDialog({
  invoiceNumber,
  defaultAmount,
  onConfirm,
  onClose,
}: {
  invoiceNumber: string
  /** Offener Bruttobetrag der Rechnung (Vorbelegung des Betragsfelds). */
  defaultAmount: number
  onConfirm: (paidAt: string, paidAmount: number) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [paidAt, setPaidAt] = useState(todayIso())
  const [amount, setAmount] = useState(defaultAmount.toFixed(2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!paidAt) {
      setError(t('markPaid.dateRequired'))
      return
    }
    const amt = Number(amount.replace(',', '.'))
    if (Number.isNaN(amt) || amt <= 0) {
      setError(t('markPaid.amountRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(paidAt, amt)
      // Erfolg: der Aufrufer schließt den Dialog (kein setBusy(false) nötig).
    } catch {
      setError(t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">
          {t('markPaid.title')}
        </h2>
        <p className="mb-4 text-sm text-muted">
          {t('markPaid.invoice', { number: invoiceNumber })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('markPaid.date')}</span>
            <input
              type="date"
              value={paidAt}
              max={todayIso()}
              onChange={(e) => setPaidAt(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('markPaid.amount')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-muted">
              {t('markPaid.openAmount', { amount: formatEUR(defaultAmount) })}
            </span>
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
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
              {busy ? t('common.saving') : t('markPaid.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
