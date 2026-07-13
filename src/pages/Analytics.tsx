import { useEffect, useState } from 'react'
import { getAnalytics, type AnalyticsData } from '../lib/analytics'
import { listSeasons } from '../lib/seasons'
import { formatEUR } from '../lib/money'
import type { Season } from '../types/asset'
import BarList from '../components/BarList'

/** Ø-Zahlungsverzug menschenlesbar aufbereiten. */
function formatDelay(days: number | null): { value: string; sub: string } {
  if (days === null) return { value: '—', sub: 'keine bezahlten Rechnungen' }
  const d = Math.round(days)
  if (d > 0) return { value: `${d} Tage`, sub: 'im Schnitt zu spät' }
  if (d < 0) return { value: `${Math.abs(d)} Tage`, sub: 'im Schnitt früher' }
  return { value: 'pünktlich', sub: 'im Schnitt fristgerecht' }
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
        if (active) setError('Auswertung konnte nicht geladen werden.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [seasonId])

  const money = data?.money
  const delay = formatDelay(money?.avgPaymentDelayDays ?? null)
  const seasonName =
    seasonId === 'all'
      ? 'bestätigte Orders'
      : (seasons.find((s) => s.id === seasonId)?.label ?? 'Saison')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">Auswertungen</h1>
        <p className="mt-1 text-sm text-muted">
          Umsatz aus bestätigten Orders und der aktuelle Geld-Stand auf einen
          Blick.
        </p>
      </div>

      {/* Saison-Filter (wirkt auf den Umsatz-Teil) */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSeasonId('all')}
          className={pillClass(seasonId === 'all')}
        >
          Alle Saisons
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
        <p className="text-sm text-muted">Lädt…</p>
      ) : (
        <>
          {/* Kennzahlen */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat value={formatEUR(data.totalRevenue)} label={`Umsatz (${seasonName})`} />
            <Stat value={formatEUR(data.money.openTotal)} label="Offen (unbezahlt)" />
            <Stat
              value={formatEUR(data.money.overdueTotal)}
              label={`Überfällig · ${data.money.overdueCount} Rechnung${
                data.money.overdueCount === 1 ? '' : 'en'
              }`}
            />
            <Stat value={delay.value} label={`Zahlungsmoral — ${delay.sub}`} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Geld-Kennzahlen: Live-Stand über alle aktiven Rechnungen
            (saison-unabhängig).
          </p>

          {/* Aufschlüsselungen */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarList title="Umsatz pro Saison" rows={data.bySeason} />
            <BarList title="Top Händler nach Umsatz" rows={data.byDealer} />
            <BarList title="Umsatz pro Land" rows={data.byRegion} />
            <BarList title="Top Artikel nach Umsatz" rows={data.byProduct} />
          </div>
        </>
      )}
    </div>
  )
}
