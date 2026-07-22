import { useState, type FormEvent } from 'react'
import type { InvoiceCreateOptions } from '../lib/invoices'
import type { FrozenInvoiceTerms } from '../lib/paymentTerms'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/** Nicht-negative Dezimalzahl aus einem Eingabefeld (Komma erlaubt); NaN → 0. */
function parseAmount(v: string): number {
  const n = Number(v.replace(',', '.'))
  return Number.isNaN(n) ? 0 : Math.max(0, n)
}

/** Nicht-negative Ganzzahl aus einem Eingabefeld; NaN → 0. */
function parseInt0(v: string): number {
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? 0 : Math.max(0, n)
}

/**
 * Dialog vor der Rechnungserstellung: zeigt die aus AB/Händler abgeleiteten
 * Zahlungskonditionen (Session 2) zum Prüfen und manuellen Überschreiben (S3)
 * und erfasst die Frachtkosten (netto, steuerwirksam). Bei Bestätigung ruft der
 * Aufrufer createInvoice(deliveryId, options) und schließt den Dialog.
 */
export default function InvoiceCreateDialog({
  defaults,
  onConfirm,
  onClose,
}: {
  defaults: FrozenInvoiceTerms
  onConfirm: (options: InvoiceCreateOptions) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [fracht, setFracht] = useState('0')
  const [ziel, setZiel] = useState(String(defaults.zahlungsziel_tage))
  const [skontoP, setSkontoP] = useState(String(defaults.skonto_prozent))
  const [skontoT, setSkontoT] = useState(String(defaults.skonto_tage))
  const [freitext, setFreitext] = useState(defaults.freitext ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onConfirm({
        frachtkosten: parseAmount(fracht),
        zahlungsziel_tage: parseInt0(ziel),
        skonto_prozent: parseAmount(skontoP),
        skonto_tage: parseInt0(skontoT),
        zahlungsbedingung_freitext: freitext.trim() || null,
      })
      // Erfolg: der Aufrufer schließt den Dialog.
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.saveFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">
          {t('invoiceCreate.title')}
        </h2>
        <p className="mb-4 text-sm text-muted">{t('invoiceCreate.subtitle')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('invoiceCreate.freight')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={fracht}
              onChange={(e) => setFracht(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-muted">
              {t('invoiceCreate.freightHint')}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t('invoiceCreate.zahlungsziel')}
              </span>
              <input
                type="number"
                min={0}
                value={ziel}
                onChange={(e) => setZiel(e.target.value)}
                className={inputClass}
              />
            </label>
            <div />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t('invoiceCreate.skontoProzent')}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={skontoP}
                onChange={(e) => setSkontoP(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {t('invoiceCreate.skontoTage')}
              </span>
              <input
                type="number"
                min={0}
                value={skontoT}
                onChange={(e) => setSkontoT(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('invoiceCreate.freitext')}</span>
            <input
              type="text"
              value={freitext}
              onChange={(e) => setFreitext(e.target.value)}
              className={inputClass}
            />
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
              {busy ? t('common.saving') : t('invoiceCreate.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
