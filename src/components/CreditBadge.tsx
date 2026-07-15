import type { CreditRating, DealerCredit } from '../lib/creditRating'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/dict'

/** Farbe + Übersetzungs-Key je Ampel-Stufe. */
const STYLES: Record<CreditRating, { dot: string; labelKey: TranslationKey }> = {
  green: { dot: 'bg-green-700', labelKey: 'credit.good' },
  yellow: { dot: 'bg-amber-500', labelKey: 'credit.watch' },
  red: { dot: 'bg-red-700', labelKey: 'credit.critical' },
  neutral: { dot: 'bg-line', labelKey: 'credit.noData' },
}

/**
 * Bonitäts-Ampel als kleines Badge. Fehlt eine Bewertung (Händler ohne
 * Rechnungen), wird sie neutral/grau dargestellt — nie rot. Der `title` erklärt
 * die Farbe (Tooltip).
 */
export default function CreditBadge({
  credit,
}: {
  credit: DealerCredit | undefined
}) {
  const t = useT()
  const rating: CreditRating = credit?.rating ?? 'neutral'
  const style = STYLES[rating]
  const reason = credit?.reason ?? 'Keine Rechnungen vorhanden.'

  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
      />
      {t(style.labelKey)}
    </span>
  )
}
