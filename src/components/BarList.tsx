import { formatEUR } from '../lib/money'
import type { RevenueRow } from '../lib/analytics'
import { useT } from '../i18n'

/**
 * Leichtgewichtige horizontale Balkenliste (reines CSS, keine Chart-Lib).
 * Balkenbreite proportional zum größten Wert. Passt zur editorialen Farbwelt:
 * Balken in Ink auf hellem Card-Track.
 */
export default function BarList({
  title,
  rows,
}: {
  title: string
  rows: RevenueRow[]
}) {
  const t = useT()
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0)

  return (
    <div className="rounded-md border-[0.5px] border-line bg-surface px-5 py-4">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('barList.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink">{r.label}</span>
                <span className="shrink-0 whitespace-nowrap text-muted tabular-nums">
                  {formatEUR(r.amount)}
                  {r.qty != null && (
                    <span className="ml-1">· {t('barList.pieces', { count: r.qty })}</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-card">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: max > 0 ? `${(r.amount / max) * 100}%` : '0%' }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
