import { useState, type FormEvent } from 'react'
import { sendInvoiceMail, type InvoiceMailContext } from '../lib/belegMail'
import { isValidEmail } from '../lib/belegMailPayload'
import { useT } from '../i18n'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/**
 * Versanddialog: Empfänger (aus dem Kunden vorbefüllt, editierbar) und die Liste
 * der anzuhängenden, archivierten PDFs. Bei Bestätigung geht EINE Mail mit allen
 * Anhängen über die Edge Function raus. E-Mail wird validiert (blocken statt
 * raten). Bei Erfolg schließt der Aufrufer den Dialog.
 */
export default function BelegMailDialog({
  context,
  onSent,
  onClose,
}: {
  context: InvoiceMailContext
  onSent: () => void
  onClose: () => void
}) {
  const t = useT()
  const [to, setTo] = useState(context.recipientDefault)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const noAttachments = context.attachments.length === 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(to)) {
      setError(t('belegMail.invalidEmail'))
      return
    }
    if (noAttachments) {
      setError(t('belegMail.noAttachments'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sendInvoiceMail(context, to)
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('belegMail.error'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">{t('belegMail.title')}</h2>
        <p className="mb-4 text-sm text-muted">
          {t('belegMail.forInvoice', { number: context.invoiceNumber })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t('belegMail.recipient')}</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="kunde@example.com"
              className={inputClass}
              autoFocus
            />
          </label>

          <div>
            <span className="text-xs text-muted">{t('belegMail.attachments')}</span>
            {noAttachments ? (
              <p className="mt-1 rounded-md border-[0.5px] border-line bg-card px-3 py-2 text-sm text-muted">
                {t('belegMail.noAttachments')}
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {context.attachments.map((a) => (
                  <li key={a.storage_path} className="text-sm text-ink">
                    • {a.filename}
                  </li>
                ))}
              </ul>
            )}
          </div>

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
              disabled={busy || noAttachments}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('belegMail.sending') : t('belegMail.send')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
