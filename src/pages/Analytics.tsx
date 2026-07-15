import { useEffect, useState } from 'react'
import { getAnalytics, type AnalyticsData } from '../lib/analytics'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import type { Season } from '../types/asset'
import BarList from '../components/BarList'
import { useT, type TFunc } from '../i18n'

/** Ø-Zahlungsverzug menschenlesbar aufbereiten. */
function formatDelay(
  days: number | null,
  t: TFunc,
): { value: string; sub: string } {
  if (days === null) return { value: '—', sub: t('analytics.delay.none') }
  const d = Math.round(days)
  if (d > 0)
    return { value: t('analytics.delay.days', { days: d }), sub: t('analytics.delay.late') }
  if (d < 0)
    return {
      value: t('analytics.delay.days', { days: Math.abs(d) }),
      sub: t('analytics.delay.early'),
    }
  return { value: t('analytics.delay.onTime'), sub: t('analytics.delay.onTimeSub') }
}

/** Eine Kennzahl-Kachel im Dashboard-Stil. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border-[0.5px] border-line bg-card px-6 py-6">
      <div className="text-2xl font-medium tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  )
}

const pillClass = (active: boolean) =>
  [
    'rounded-full px-3 py-1 text-sm transition-colors',
    active
      ? 'bg-ink text-cream'
      : 'border-[0.5px] border-line text-muted hover:text-ink',
  ].join(' ')

export default function Analytics() {
  const t = useT()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState<string | 'all'>('all')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Saisons einmalig für den Filter laden.
  useEffect(() => {
    listSeasons()
      .then(setSeasons)
      .catch(() => {
        /* Filter bleibt bei „Alle" — kein harter Fehler. */
      })
  }, [])

  // Auswertung bei jedem Saison-Wechsel neu laden.
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    getAnalytics(seasonId)
      .then((d) => {
        if (active) setData(d)
      })
      .catch(() => {
        if (active) setError(t('analytics.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [seasonId])

  const money = data?.money
  const delay = formatDelay(money?.avgPaymentDelayDays ?? null, t)
  const seasonName =
    seasonId === 'all'
      ? t('analytics.confirmedOrders')
      : (seasons.find((s) => s.id === seasonId)?.label ??
        t('analytics.seasonFallback'))

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">{t('analytics.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('analytics.subtitle')}</p>
      </div>

      {/* Saison-Filter (wirkt auf den Umsatz-Teil) */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSeasonId('all')}
          className={pillClass(seasonId === 'all')}
        >
          {t('common.allSeasons')}
        </button>
        {seasons.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSeasonId(s.id)}
            className={pillClass(seasonId === s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border-[0.5px] border-line bg-card px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              value={formatEUR(data.totalRevenue)}
              label={t('analytics.revenue', { scope: seasonName })}
            />
            <Stat
              value={formatEUR(data.money.openTotal)}
              label={t('analytics.openUnpaid')}
            />
            <Stat
              value={formatEUR(data.money.overdueTotal)}
              label={t('analytics.overdue', {
                count: data.money.overdueCount,
                label:
                  data.money.overdueCount === 1
                    ? t('analytics.invoiceSingular')
                    : t('analytics.invoicePlural'),
              })}
            />
            <Stat
              value={delay.value}
              label={t('analytics.paymentMorale', { sub: delay.sub })}
            />
          </div>
          <p className="mt-2 text-xs text-muted">{t('analytics.moneyNote')}</p>

          {/* Aufschlüsselungen */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarList title={t('analytics.bar.revenueBySeason')} rows={data.bySeason} />
            <BarList title={t('analytics.bar.topDealers')} rows={data.byDealer} />
            <BarList title={t('analytics.bar.revenueByCountry')} rows={data.byRegion} />
            <BarList title={t('analytics.bar.topProducts')} rows={data.byProduct} />
          </div>
        </>
      )}
    </div>
  )
}
