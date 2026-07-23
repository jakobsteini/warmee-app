import { useState, type FormEvent } from 'react'
import { sendOrderConfirmationMail, abLang } from '../lib/abMail'
import { isValidEmail } from '../lib/belegMailPayload'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/**
 * Versanddialog für die Auftragsbestätigung. Empfänger aus dem Kunden vorbefüllt,
 * editierbar; Belegsprache wird angezeigt. E-Mail wird validiert (block-statt-raten).
 * Bei Bestätigung geht die AB (als PDF-Anhang) über den gemeinsamen Webhook raus.
 */
export default function AbMailDialog({
  orderId,
  orderNumber,
  dealerName,
  language,
  assignment,
  recipientDefault,
  onSent,
  onClose,
}: {
  orderId: string
  orderNumber: string
  dealerName: string
  language: string | null
  assignment: string
  recipientDefault: string
  onSent: () => void
  onClose: () => void
}) {
  const t = useT()
  const [to, setTo] = useState(recipientDefault)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lang = abLang(language)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(to)) {
      setError(t('abMail.invalidEmail'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sendOrderConfirmationMail({
        orderId,
        orderNumber,
        dealerName,
        language,
        assignment,
        to,
      })
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('abMail.error'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">{t('abMail.title')}</h2>
        <p className="mb-4 text-sm text-muted">
          {t('abMail.forOrder', { number: orderNumber })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('abMail.recipient')}</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="kunde@example.com"
              className={inputClass}
              autoFocus
            />
          </label>

          <p className="rounded-md border-[0.5px] border-line bg-card px-3 py-2 text-sm text-muted">
            {t('abMail.info', {
              lang: lang === 'en' ? t('common.langEn') : t('common.langDe'),
              file: `${orderNumber}.pdf`,
            })}
          </p>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border-[0.5px] border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-card disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('abMail.sending') : t('abMail.send')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
