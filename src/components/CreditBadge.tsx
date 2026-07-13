import type { CreditRating, DealerCredit } from '../lib/creditRating'

/** Farbe + Kurzlabel je Ampel-Stufe. */
const STYLES: Record<CreditRating, { dot: string; label: string }> = {
  green: { dot: 'bg-green-700', label: 'Gut' },
  yellow: { dot: 'bg-amber-500', label: 'Beobachten' },
  red: { dot: 'bg-red-700', label: 'Kritisch' },
  neutral: { dot: 'bg-line', label: 'Keine Daten' },
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
      {style.label}
    </span>
  )
}
