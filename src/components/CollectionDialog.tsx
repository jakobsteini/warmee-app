import { useState, type FormEvent } from 'react'
import { formatEUR } from '../lib/money'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Grunddaten des Falls, in beiden Dialogen im Kopf angezeigt. */
export interface CollectionCaseInfo {
  dealerName: string | null
  invoiceNumber: string
  openAmount: number
}

function DialogShell({
  title,
  info,
  children,
}: {
  title: string
  info: CollectionCaseInfo
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-3 text-lg font-medium text-ink">{title}</h2>
        <dl className="mb-4 space-y-1 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t('common.dealer')}</dt>
            <dd className="text-ink">{info.dealerName ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t('invoices.col.number')}</dt>
            <dd className="text-ink">{info.invoiceNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t('collection.openAmount')}</dt>
            <dd className="font-medium text-ink">
              {formatEUR(info.openAmount)}
            </dd>
          </div>
        </dl>
        {children}
      </div>
    </div>
  )
}

/**
 * Bestätigungsdialog „An Inkasso übergeben" mit Anzeige von Händler,
 * Rechnungsnummer und offenem Betrag. Bei Erfolg schließt der Aufrufer.
 */
export function HandOverDialog({
  info,
  onConfirm,
  onClose,
}: {
  info: CollectionCaseInfo
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch {
      setError(t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <DialogShell title={t('collection.handOverTitle')} info={info}>
      <p className="mb-4 text-sm text-muted">{t('collection.handOverHint')}</p>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="rounded-md bg-red-700 px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('collection.handOverConfirm')}
        </button>
      </div>
    </DialogShell>
  )
}

/**
 * Dialog „Inkasso zurückziehen" mit Pflichtfeld Grund. Kein Löschen — der
 * Vorgang bleibt in der Historie, der Status geht auf die vorherige Mahnstufe.
 */
export function WithdrawDialog({
  info,
  onConfirm,
  onClose,
}: {
  info: CollectionCaseInfo
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
      setError(t('collection.reasonRequired'))
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
    <DialogShell title={t('collection.withdrawTitle')} info={info}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">
            {t('collection.reasonLabel')}
          </span>
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
            {busy ? t('common.saving') : t('collection.withdrawConfirm')}
          </button>
        </div>
      </form>
    </DialogShell>
  )
}
