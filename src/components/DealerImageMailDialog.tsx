import { useState, type FormEvent } from 'react'
import { sendDealerImagesMail } from '../lib/dealerImageMail'
import { isValidEmail } from '../lib/belegMailPayload'
import { useT } from '../i18n'
import type { AssetWithMeta } from '../types/asset'

const inputClass =
  'rounded-md border-[0.5px] border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink'

/**
 * Versanddialog für das Händler-Bildmaterial: Empfänger (aus dem Händler
 * vorbefüllt, editierbar) + Hinweis, dass ein Download-Link verschickt wird.
 * Bei Bestätigung wird eine ZIP gebaut, hochgeladen und der Link per Mail
 * verschickt (Edge Function). E-Mail wird validiert (blocken statt raten);
 * Fehler bleiben sichtbar. Bei Erfolg schließt der Aufrufer den Dialog.
 */
export default function DealerImageMailDialog({
  dealerId,
  dealerName,
  language,
  recipientDefault,
  images,
  onSent,
  onClose,
}: {
  dealerId: string
  dealerName: string
  language: string | null
  recipientDefault: string
  images: AssetWithMeta[]
  onSent: (skipped: number) => void
  onClose: () => void
}) {
  const t = useT()
  const [to, setTo] = useState(recipientDefault)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(to)) {
      setError(t('dealerImageMail.invalidEmail'))
      return
    }
    if (images.length === 0) {
      setError(t('dealerImageMail.noImages'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { skipped } = await sendDealerImagesMail({
        dealerId,
        dealerName,
        language,
        images,
        to,
      })
      onSent(skipped)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dealerImageMail.error'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-medium text-ink">
          {t('dealerImageMail.title')}
        </h2>
        <p className="mb-4 text-sm text-muted">
          {t('dealerImageMail.forDealer', { name: dealerName })}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t('dealerImageMail.recipient')}
            </span>
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
            {t('dealerImageMail.linkNote', { count: images.length })}
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
              disabled={busy || images.length === 0}
              className="rounded-md bg-ink px-4 py-2 text-sm text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t('dealerImageMail.sending') : t('dealerImageMail.send')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
